import type { AuthenticatedUser } from "../features/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};
