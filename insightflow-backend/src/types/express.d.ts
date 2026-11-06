import type { UserRole, AccountStatus } from "../modules/users/user.constants.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  isEmailVerified: boolean;
  sessionId?: string;
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}
