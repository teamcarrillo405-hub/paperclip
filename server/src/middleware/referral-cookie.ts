import type { NextFunction, Request, Response } from "express";

export const REFERRAL_COOKIE_NAME = "avero_ref";
const REFERRAL_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PARTNER_CODE_PATTERN = /^[A-Z0-9]{4,32}$/i;

export function referralCookieMiddleware() {
  return function referralCookie(req: Request, res: Response, next: NextFunction) {
    const ref = req.query.ref;
    if (typeof ref === "string" && PARTNER_CODE_PATTERN.test(ref)) {
      res.cookie(REFERRAL_COOKIE_NAME, ref, {
        maxAge: REFERRAL_COOKIE_MAX_AGE_MS,
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      });
    }
    next();
  };
}

export function readReferralCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== REFERRAL_COOKIE_NAME) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return PARTNER_CODE_PATTERN.test(value) ? value : null;
  }
  return null;
}
