import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";

export const REFRESH_COOKIE_NAME = "refreshToken";

// 7 days in milliseconds
export const DEFAULT_REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const getRefreshCookieOptions = (
  maxAgeMs: number = DEFAULT_REFRESH_COOKIE_MAX_AGE
): CookieOptions => {
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: maxAgeMs,
  };

  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
};

export const setRefreshCookie = (
  res: Response,
  token: string,
  maxAgeMs: number = DEFAULT_REFRESH_COOKIE_MAX_AGE
): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, getRefreshCookieOptions(maxAgeMs));
};

export const clearRefreshCookie = (res: Response): void => {
  const clearOptions = { ...getRefreshCookieOptions(0), maxAge: 0 };
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
};

export const getRefreshTokenFromRequest = (req: Request): string | undefined => {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return req.cookies[REFRESH_COOKIE_NAME] as string;
  }
  return undefined;
};
