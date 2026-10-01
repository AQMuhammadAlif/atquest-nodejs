import jwt, { type SignOptions } from "jsonwebtoken";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET is required");
  }
  return value;
}

export function signToken(userId: string) {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign({ sub: userId }, secret(), { expiresIn });
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, secret());
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Invalid token");
  }
  return { sub: payload.sub };
}
