import jwt, { type SignOptions } from "jsonwebtoken";

const EMPLOYEE_ID_CLAIM = "employeeId";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET is required");
  }
  return value;
}

export type TokenClaims = {
  userName?: string;
  email?: string;
  employeeId?: string | null;
};

// Same claims ESS UserSessionService.CreateJwt issues: sub, unique_name, email, employeeId.
export function signToken(userId: string, claims: TokenClaims = {}) {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  const payload: Record<string, string> = { sub: userId };
  if (claims.userName) payload.unique_name = claims.userName;
  if (claims.email) payload.email = claims.email;
  if (claims.employeeId) payload[EMPLOYEE_ID_CLAIM] = claims.employeeId;
  return jwt.sign(payload, secret(), { expiresIn });
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, secret());
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Invalid token");
  }
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return {
    sub: payload.sub,
    employeeId: text(payload[EMPLOYEE_ID_CLAIM]),
    loginName: text(payload.unique_name),
  };
}
