import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/password.js";

// Generated with .NET: Rfc2898DeriveBytes.Pbkdf2("P@ssw0rd!", bytes 0..15, 100000, SHA256, 32)
const ESS_SALT = "AAECAwQFBgcICQoLDA0ODw==";
const ESS_HASH = "SITyk+A7SDamHaJCup6ffYgBPRdXfQ7Lk7MHn4q02+0=";

describe("password (ESS PBKDF2 compatibility)", () => {
  it("verifies a hash produced by ESS_Backend", () => {
    expect(verifyPassword("P@ssw0rd!", ESS_SALT, ESS_HASH)).toBe(true);
    expect(verifyPassword("wrong", ESS_SALT, ESS_HASH)).toBe(false);
  });

  it("round-trips its own hashes with a 16-byte salt and 32-byte hash", () => {
    const { hash, salt } = hashPassword("secret");
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(hash, "base64")).toHaveLength(32);
    expect(verifyPassword("secret", salt, hash)).toBe(true);
  });

  it("rejects empty salt or hash", () => {
    expect(verifyPassword("x", "", ESS_HASH)).toBe(false);
    expect(verifyPassword("x", ESS_SALT, "")).toBe(false);
  });
});
