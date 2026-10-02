import type { UserRole } from "@prisma/client";

export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
  displayName: string | null;
};
