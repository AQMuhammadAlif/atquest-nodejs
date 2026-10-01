import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

// Same scheme as ESS_Backend (UserService.CreatePasswordHash / UserAuthService.VerifyPassword):
// PBKDF2-SHA256, 100,000 iterations, 16-byte salt, 32-byte hash, both stored as base64.
const ITERATIONS = 100_000;
const DIGEST = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, DIGEST);
  return { hash: hash.toString("base64"), salt: salt.toString("base64") };
}

export function verifyPassword(password: string, saltBase64: string, expectedHashBase64: string) {
  const salt = Buffer.from(saltBase64, "base64");
  const expected = Buffer.from(expectedHashBase64, "base64");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, ITERATIONS, expected.length, DIGEST);
  return timingSafeEqual(actual, expected);
}
