import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors.js";
import { verifyToken } from "../utils/token.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
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
    req.userId = verifyToken(token).sub;
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}
