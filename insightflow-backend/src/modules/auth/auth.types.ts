import type { UserPreferences } from "../users/user.types.js";
import type { UserRole, AccountStatus } from "../users/user.constants.js";

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  isEmailVerified: boolean;
  profilePicture?: string;
  preferences: UserPreferences;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  user: SafeUser;
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}
