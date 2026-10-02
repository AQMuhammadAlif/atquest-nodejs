import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
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

// JwtBearerHandler's challenge: an empty 401 with a WWW-Authenticate header. The /v1 endpoints
// migrated from ESS_Backend answer this way (its FallbackPolicy requires an authenticated user).
function jwtBearerChallenge(error: unknown) {
  if (error === undefined) {
    return "Bearer";
  }
  if (error instanceof jwt.TokenExpiredError) {
    const at = error.expiredAt;
    const pad = (value: number) => String(value).padStart(2, "0");
    // DateTime.ToString(CultureInfo.InvariantCulture) of the UTC expiry
    const expiry = `${pad(at.getUTCMonth() + 1)}/${pad(at.getUTCDate())}/${at.getUTCFullYear()} ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
    return `Bearer error="invalid_token", error_description="The token expired at '${expiry}'"`;
  }
  if (error instanceof jwt.JsonWebTokenError && error.message === "invalid signature") {
    return 'Bearer error="invalid_token", error_description="The signature is invalid"';
  }
  return 'Bearer error="invalid_token"';
}

// requireAuth for the /v1 routers: same claims, ESS's 401 response.
export function requireEssAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = /^bearer /i.test(header) ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).set("WWW-Authenticate", jwtBearerChallenge(undefined)).end();
    return;
  }

  let claims: ReturnType<typeof verifyToken>;
  try {
    claims = verifyToken(token);
  } catch (error) {
    res.status(401).set("WWW-Authenticate", jwtBearerChallenge(error)).end();
    return;
  }
  req.userId = claims.sub;
  req.tokenEmployeeId = claims.employeeId;
  req.loginName = claims.loginName;
  next();
}
