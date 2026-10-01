import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/models/user.js", () => ({
  findUserByUserNameOrEmail: vi.fn(),
  findAuthProviderById: vi.fn(),
  updateLoginState: vi.fn(),
}));

import * as users from "../src/models/user.js";
import { app } from "../src/app.js";

const SALT = "AAECAwQFBgcICQoLDA0ODw==";
const HASH = "SITyk+A7SDamHaJCup6ffYgBPRdXfQ7Lk7MHn4q02+0="; // "P@ssw0rd!"

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 7n,
    userName: "jdoe",
    email: "jdoe@example.com",
    displayName: "John Doe",
    authProviderId: 1n,
    isActive: true,
    isLocked: false,
    lockedAt: null,
    passwordHash: HASH,
    passwordSalt: SALT,
    failedLoginCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const login = (body: object) => request(app).post("/api/auth/login").send(body);

describe("POST /api/auth/login (rbac.Users)", () => {
  beforeEach(() => {
    vi.mocked(users.findUserByUserNameOrEmail).mockReset();
    vi.mocked(users.updateLoginState).mockReset();
    vi.mocked(users.findAuthProviderById).mockReset().mockResolvedValue({ authProviderCode: "local" } as never);
  });

  it("logs in by userNameOrEmail, resets counters and returns a token", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser({ failedLoginCount: 2 }) as never);

    const res = await login({ userNameOrEmail: " jdoe ", password: "P@ssw0rd!" });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: "7", userName: "jdoe", name: "John Doe" });
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(users.findUserByUserNameOrEmail).toHaveBeenCalledWith("jdoe");
    expect(users.updateLoginState).toHaveBeenCalledWith(
      7n,
      expect.objectContaining({ failedLoginCount: 0, isLocked: false, lockedAt: null, lastLoginAt: expect.any(Date) }),
    );
  });

  it("accepts the legacy `email` field", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser() as never);
    const res = await login({ email: "jdoe@example.com", password: "P@ssw0rd!" });
    expect(res.status).toBe(200);
  });

  it.each([[{}], [{ userNameOrEmail: "jdoe" }]])("returns 401 Invalid credentials. for %o", async (body) => {
    const res = await login(body);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials.");
  });

  it("returns 401 for an unknown user", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(null);
    const res = await login({ userNameOrEmail: "x", password: "y" });
    expect(res.status).toBe(401);
  });

  it.each([
    [{ isActive: false }, "User is inactive."],
    [{ isLocked: true, lockedAt: null }, "User is locked."],
    [{ isLocked: true, lockedAt: new Date() }, "User is locked."],
    [{ passwordHash: null }, "Password is not set for this user."],
  ])("returns 403 for %o", async (overrides, message) => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser(overrides) as never);
    const res = await login({ userNameOrEmail: "jdoe", password: "P@ssw0rd!" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(message);
  });

  it("returns 403 for non-LOCAL auth providers", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser() as never);
    vi.mocked(users.findAuthProviderById).mockResolvedValue({ authProviderCode: "ADFS" } as never);
    const res = await login({ userNameOrEmail: "jdoe", password: "P@ssw0rd!" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Only LOCAL auth provider supports password login.");
  });

  it("auto-unlocks once the lock window has elapsed", async () => {
    const lockedAt = new Date(Date.now() - 16 * 60_000);
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(
      makeUser({ isLocked: true, lockedAt, failedLoginCount: 5 }) as never,
    );
    const res = await login({ userNameOrEmail: "jdoe", password: "P@ssw0rd!" });
    expect(res.status).toBe(200);
    expect(users.updateLoginState).toHaveBeenNthCalledWith(1, 7n, { failedLoginCount: 0, isLocked: false, lockedAt: null });
  });

  it("counts a failed attempt", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser({ failedLoginCount: 1 }) as never);
    const res = await login({ userNameOrEmail: "jdoe", password: "bad" });
    expect(res.status).toBe(401);
    expect(users.updateLoginState).toHaveBeenCalledWith(7n, { failedLoginCount: 2, isLocked: false, lockedAt: null });
  });

  it("locks on the 5th failed attempt and reports 403 User is locked.", async () => {
    vi.mocked(users.findUserByUserNameOrEmail).mockResolvedValue(makeUser({ failedLoginCount: 4 }) as never);
    const res = await login({ userNameOrEmail: "jdoe", password: "bad" });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("User is locked.");
    expect(users.updateLoginState).toHaveBeenCalledWith(7n, {
      failedLoginCount: 5,
      isLocked: true,
      lockedAt: expect.any(Date),
    });
  });
});
