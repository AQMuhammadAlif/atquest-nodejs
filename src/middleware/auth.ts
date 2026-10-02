import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors.js";
import { verifyToken } from "../utils/token.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tokenEmployeeId?: string;
      loginName?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "Unauthorized"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const claims = verifyToken(token);
    req.userId = claims.sub;
    req.tokenEmployeeId = claims.employeeId;
    req.loginName = claims.loginName;
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}
