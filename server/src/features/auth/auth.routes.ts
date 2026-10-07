import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AccountStatus, UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { requireAuthentication } from "../../middleware/authenticate";
import { requireTrustedOrigin } from "../../middleware/require-trusted-origin";
import { validateBody } from "../../middleware/validate-body";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import {
  clearSessionCookie,
  hashSessionToken,
  issueSessionToken,
  setSessionCookie,
} from "./auth.security";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "./auth.schemas";
import {
  findDemoUserByEmail,
  findDemoUserById,
  isDbError,
  revokeDemoSession,
  saveDemoSession,
  saveDemoUser,
  syncDemoState,
  type DemoUser,
} from "../../lib/demo-store";

export const authRouter = Router();

const PASSWORD_HASH_ROUNDS = 12;

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Try again later.",
    },
  },
});

function sessionExpiry(): Date {
  return new Date(
    Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000
  );
}

authRouter.post(
  "/register",
  authAttemptLimiter,
  requireTrustedOrigin,
  validateBody(registerSchema),
  async (request, response, next) => {
    try {
      const input = request.body as RegisterInput;
      const role = input.role ?? UserRole.RECYCLER;

      const passwordHash = await bcrypt.hash(
        input.password,
        PASSWORD_HASH_ROUNDS
      );

      const sessionId = randomUUID();
      const expiresAt = sessionExpiry();

      let result:
        | {
            token: string;
            user: {
              id: string;
              email: string;
              role: UserRole;
              displayName: string | null;
            };
          }
        | undefined;

      try {
        /*
         * Increased Prisma transaction limits.
         *
         * maxWait:
         * Maximum time Prisma waits to acquire a database connection.
         *
         * timeout:
         * Maximum time the interactive transaction is allowed to run.
         */
        result = await prisma.$transaction(
          async (transaction) => {
            const user = await transaction.user.create({
              data: {
                email: input.email,
                passwordHash,
                role,
                status: AccountStatus.ACTIVE,

                recyclerProfile: {
                  create: {
                    displayName: input.displayName,
                    phone: input.phone,
                  },
                },

                ...(role === UserRole.RECYCLER
                  ? {
                      rewardWallet: {
                        create: {},
                      },
                    }
                  : {}),
              },

              include: {
                recyclerProfile: true,
              },
            });

            /*
             * COLLECTOR REGISTRATION
             */
            if (role === UserRole.COLLECTOR) {
              await transaction.collectorProfile.create({
                data: {
                  userId: user.id,
                  serviceArea: input.serviceArea!,
                  serviceRadiusKm: input.serviceRadiusKm!,
                  serviceCenterLatitude:
                    input.serviceCenterLatitude!,
                  serviceCenterLongitude:
                    input.serviceCenterLongitude!,
                  vehicleType: input.vehicleType!,
                  vehicleDescription: input.vehicleDescription,
                  vehicleRegistration: input.vehicleRegistration,
                },
              });
            }

            /*
             * FACILITY REGISTRATION
             */
            if (role === UserRole.FACILITY) {
              const materialRecords = await Promise.all(
                input.acceptedMaterials!.map((name) => {
                  const slug = name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");

                  return transaction.material.upsert({
                    where: {
                      slug,
                    },
                    update: {
                      isActive: true,
                    },
                    create: {
                      slug,
                      name,
                    },
                  });
                })
              );

              await transaction.facility.create({
                data: {
                  name: input.facilityName!,
                  address: input.facilityAddress!,
                  latitude: input.facilityLatitude ?? 0,
                  longitude: input.facilityLongitude ?? 0,
                  createdByUserId: user.id,

                  memberships: {
                    create: {
                      userId: user.id,
                      role: "OWNER",
                    },
                  },

                  materials: {
                    create: materialRecords.map((material) => ({
                      materialId: material.id,
                    })),
                  },

                  openingHours: {
                    create: input.openingHours!.map(
                      (hours, dayOfWeek) => {
                        const isClosed =
                          !hours || /^closed$/i.test(hours);

                        const [opensAt, closesAt] = hours
                          ? hours.split("-")
                          : [null, null];

                        return {
                          dayOfWeek,
                          opensAt: isClosed ? null : opensAt,
                          closesAt: isClosed ? null : closesAt,
                          isClosed,
                        };
                      }
                    ),
                  },
                },
              });
            }

            /*
             * NOTIFY ADMINISTRATORS
             *
             * This remains inside the transaction so the registration
             * and notification creation succeed or fail together.
             */
            if (role !== UserRole.RECYCLER) {
              const admins = await transaction.user.findMany({
                where: {
                  role: UserRole.ADMIN,
                  status: AccountStatus.ACTIVE,
                },
                select: {
                  id: true,
                },
              });

              if (admins.length) {
                await transaction.notification.createMany({
                  data: admins.map(({ id }) => ({
                    userId: id,
                    type:
                      role === UserRole.COLLECTOR
                        ? ("COLLECTOR_REGISTRATION" as const)
                        : ("FACILITY_REGISTRATION" as const),

                    title:
                      role === UserRole.COLLECTOR
                        ? "New collector registration"
                        : "New facility registration",

                    body:
                      role === UserRole.COLLECTOR
                        ? `${input.displayName} submitted a collector application for review.`
                        : `${input.facilityName} submitted a facility application for review.`,
                  })),
                });
              }
            }

            /*
             * CREATE SESSION
             */
            const token = issueSessionToken(
              user.id,
              sessionId
            );

            await transaction.session.create({
              data: {
                id: sessionId,
                userId: user.id,
                tokenHash: hashSessionToken(token),
                expiresAt,
              },
            });

            return {
              token,

              user: {
                id: user.id,
                email: user.email,
                role: user.role,
                displayName:
                  user.recyclerProfile?.displayName ?? null,
              },
            };
          },

          /*
           * IMPORTANT FIX:
           *
           * Give Neon/Prisma more time to acquire and complete
           * the interactive transaction.
           */
          {
            maxWait: 10000,
            timeout: 30000,
          }
        );
      } catch (error) {
        /*
         * Database unavailable -> fallback to demo-store
         */
        if (!isDbError(error)) {
          throw error;
        }

        if (role !== UserRole.RECYCLER) {
          throw new ApiError(
            503,
            "ROLE_REGISTRATION_UNAVAILABLE",
            "Collector and Facility registration require the database to be available."
          );
        }

        if (findDemoUserByEmail(input.email)) {
          throw new ApiError(
            409,
            "CONFLICT",
            "A record with this value already exists."
          );
        }

        const userId = randomUUID();

        const demoUser: DemoUser = {
          id: userId,
          email: input.email,
          passwordHash,
          role,
          status: AccountStatus.ACTIVE,
          displayName: input.displayName,
          phone: input.phone,
        };

        saveDemoUser(demoUser);

        const token = issueSessionToken(
          userId,
          sessionId
        );

        saveDemoSession({
          id: sessionId,
          userId,
          tokenHash: hashSessionToken(token),
          expiresAt,
          revokedAt: null,
        });

        result = {
          token,

          user: {
            id: userId,
            email: demoUser.email,
            role: demoUser.role,
            displayName: demoUser.displayName,
          },
        };
      }

      if (!result) {
        throw new ApiError(
          500,
          "INTERNAL_SERVER_ERROR",
          "Failed to create account."
        );
      }

      setSessionCookie(response, result.token);

      response.status(201).json({
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * LOGIN
 */
authRouter.post(
  "/login",
  authAttemptLimiter,
  requireTrustedOrigin,
  validateBody(loginSchema),
  async (request, response, next) => {
    try {
      const input = request.body as LoginInput;

      let user:
        | {
            id: string;
            email: string;
            passwordHash: string;
            role: UserRole;
            status: AccountStatus;
            displayName: string | null;
          }
        | undefined;

      let isFromDb = false;

      try {
        const dbUser = await prisma.user.findUnique({
          where: {
            email: input.email,
          },

          include: {
            recyclerProfile: true,
          },
        });

        if (dbUser) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            passwordHash: dbUser.passwordHash,
            role: dbUser.role,
            status: dbUser.status,
            displayName:
              dbUser.recyclerProfile?.displayName ?? null,
          };

          isFromDb = true;
        }
      } catch (error) {
        if (!isDbError(error)) {
          throw error;
        }
      }

      /*
       * Demo-store fallback
       */
      if (!user) {
        syncDemoState();

        const demoUser = findDemoUserByEmail(
          input.email
        );

        if (demoUser) {
          user = {
            id: demoUser.id,
            email: demoUser.email,
            passwordHash: demoUser.passwordHash,
            role: demoUser.role,
            status: demoUser.status,
            displayName: demoUser.displayName,
          };
        }
      }

      if (
        !user ||
        !(await bcrypt.compare(
          input.password,
          user.passwordHash
        ))
      ) {
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect."
        );
      }

      if (user.status !== AccountStatus.ACTIVE) {
        throw new ApiError(
          403,
          "ACCOUNT_UNAVAILABLE",
          "This account is not currently available."
        );
      }

      const sessionId = randomUUID();
      const token = issueSessionToken(
        user.id,
        sessionId
      );

      const expiresAt = sessionExpiry();

      if (isFromDb) {
        try {
          await prisma.session.create({
            data: {
              id: sessionId,
              userId: user.id,
              tokenHash: hashSessionToken(token),
              expiresAt,
            },
          });
        } catch (error) {
          if (!isDbError(error)) {
            throw error;
          }

          saveDemoSession({
            id: sessionId,
            userId: user.id,
            tokenHash: hashSessionToken(token),
            expiresAt,
            revokedAt: null,
          });
        }
      } else {
        saveDemoSession({
          id: sessionId,
          userId: user.id,
          tokenHash: hashSessionToken(token),
          expiresAt,
          revokedAt: null,
        });
      }

      setSessionCookie(response, token);

      response.status(200).json({
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            displayName: user.displayName,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
 * SESSION
 */
authRouter.get(
  "/session",
  requireAuthentication,
  (request, response) => {
    const user = request.auth!;

    response.status(200).json({
      data: {
        authenticated: true,

        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
        },
      },
    });
  }
);

/*
 * LOGOUT
 */
authRouter.post(
  "/logout",
  requireTrustedOrigin,
  requireAuthentication,
  async (request, response, next) => {
    try {
      try {
        await prisma.session.updateMany({
          where: {
            id: request.auth!.sessionId,
            revokedAt: null,
          },

          data: {
            revokedAt: new Date(),
          },
        });
      } catch (error) {
        if (!isDbError(error)) {
          throw error;
        }
      }

      revokeDemoSession(
        request.auth!.sessionId
      );

      clearSessionCookie(response);

      response.status(200).json({
        data: {
          signedOut: true,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);