import { AccountStatus, UserRole } from "@prisma/client";

export type DemoUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  displayName: string | null;
  phone?: string | null;
};

export type DemoSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export const demoUsers = new Map<string, DemoUser>();
export const demoSessions = new Map<string, DemoSession>();

export function saveDemoUser(user: DemoUser): void {
  demoUsers.set(user.email.toLowerCase(), user);
  demoUsers.set(user.id, user);
}

export function saveDemoSession(session: DemoSession): void {
  demoSessions.set(session.id, session);
}

export function findDemoUserByEmail(email: string): DemoUser | undefined {
  return demoUsers.get(email.toLowerCase());
}

export function findDemoUserById(id: string): DemoUser | undefined {
  return demoUsers.get(id);
}

export function findDemoSessionById(sessionId: string): DemoSession | undefined {
  return demoSessions.get(sessionId);
}

export function revokeDemoSession(sessionId: string): void {
  const session = demoSessions.get(sessionId);
  if (session) {
    session.revokedAt = new Date();
  }
}

export function isDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; name?: string; message?: string };
  if (err.code === "P1001" || err.code === "P1002" || err.code === "P1003" || err.code === "P1008" || err.code === "P1017") {
    return true;
  }
  if (err.name === "PrismaClientInitializationError" || err.name === "PrismaClientInitializationError") {
    return true;
  }
  if (err.message && (
    err.message.includes("Can't reach database server") ||
    err.message.includes("P1001") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ETIMEDOUT")
  )) {
    return true;
  }
  return false;
}

export function syncDemoState(): void {
  const demoUsersToSeed: DemoUser[] = [
    {
      id: "demo-user",
      email: "demo@wastewise.local",
      passwordHash: "$2a$12$Hf2cnDNx4A7s2lQ9N3QOgu8mQ8w2JpTgqj17v1jO5v2M2LQK3q4u.",
      role: UserRole.RECYCLER,
      status: AccountStatus.ACTIVE,
      displayName: "Demo User",
      phone: null,
    },
    {
      id: "demo-collector",
      email: "collectors@gmail.com",
      passwordHash: "$2b$12$QOETg9dylze0WTtyn.nyDOrO5cRAgj3/QDxorv3CPJ2JYxrqun0aW",
      role: UserRole.COLLECTOR,
      status: AccountStatus.ACTIVE,
      displayName: "Demo Collector",
      phone: null,
    },
    {
      id: "demo-collector-alt",
      email: "collector@gmail.com",
      passwordHash: "$2b$12$QOETg9dylze0WTtyn.nyDOrO5cRAgj3/QDxorv3CPJ2JYxrqun0aW",
      role: UserRole.COLLECTOR,
      status: AccountStatus.ACTIVE,
      displayName: "Collector Demo",
      phone: null,
    },
  ];

  for (const demoUser of demoUsersToSeed) {
    if (!findDemoUserByEmail(demoUser.email)) {
      saveDemoUser(demoUser);
    }
  }
}

