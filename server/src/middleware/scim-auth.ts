import type { Request, Response, NextFunction } from "express";
import { validateSCIMToken } from "../services/scim-token.js";

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export async function scimAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({
      schemas: [SCIM_ERROR_SCHEMA],
      detail: "Unauthorized",
      status: 401,
    });
    return;
  }

  const token = auth.slice(7);
  const valid = await validateSCIMToken(token);
  if (!valid) {
    res.status(401).json({
      schemas: [SCIM_ERROR_SCHEMA],
      detail: "Unauthorized",
      status: 401,
    });
    return;
  }

  next();
}
