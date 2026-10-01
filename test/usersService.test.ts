import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authHeader } from "./helpers.js";

vi.mock("../src/models/user.js", () => ({
  authProviderExists: vi.fn(),
  countRolesByIds: vi.fn(),
  emailExists: vi.fn(),
  insertUserWithRoles: vi.fn(),
  listUsers: vi.fn(),
  userNameExists: vi.fn(),
  userPrincipalNameExists: vi.fn(),
}));

import * as users from "../src/models/user.js";
import { app } from "../src/app.js";
import { verifyPassword } from "../src/utils/password.js";

const validBody = {
  authProviderId: 1,
  userName: " jdoe ",
  email: "jdoe@example.com",
  displayName: "John Doe",
  roleIds: [2, 3, 2],
  password: "secret",
};

const created = {
  userId: 9n,
  userName: "jdoe",
  email: "jdoe@example.com",
  displayName: "John Doe",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("/api/users (rbac.Users)", () => {
  beforeEach(() => {
    vi.mocked(users.authProviderExists).mockReset().mockResolvedValue(true);
    vi.mocked(users.countRolesByIds).mockReset().mockImplementation(async (ids) => ids.length);
    vi.mocked(users.userNameExists).mockReset().mockResolvedValue(false);
    vi.mocked(users.emailExists).mockReset().mockResolvedValue(false);
    vi.mocked(users.userPrincipalNameExists).mockReset().mockResolvedValue(false);
    vi.mocked(users.insertUserWithRoles).mockReset().mockResolvedValue(created);
  });

  it("requires authentication to create users", async () => {
    const res = await request(app).post("/api/users").send(validBody);
    expect(res.status).toBe(401);
  });

  it("creates a user with a PBKDF2 hash and distinct roles", async () => {
    const res = await request(app).post("/api/users").set(authHeader()).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({
      id: "9",
      userName: "jdoe",
      email: "jdoe@example.com",
      name: "John Doe",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const [data, roleIds] = vi.mocked(users.insertUserWithRoles).mock.calls[0];
    expect(roleIds).toEqual([2n, 3n]);
    expect(data).toMatchObject({
      userName: "jdoe",
      isActive: true,
      isLocked: false,
      mustChangePassword: false,
      actor: "system",
      userPrincipalName: null,
    });
    expect(verifyPassword("secret", data.passwordSalt, data.passwordHash)).toBe(true);
  });

  it("returns 400 when the auth provider or a role does not exist", async () => {
    vi.mocked(users.countRolesByIds).mockResolvedValue(1);
    const res = await request(app).post("/api/users").set(authHeader()).send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("AuthProviderId or one/more RoleIds are invalid.");
  });

  it("returns 400 when no roles are given", async () => {
    const res = await request(app).post("/api/users").set(authHeader()).send({ ...validBody, roleIds: [] });
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate user name, email or UPN", async () => {
    vi.mocked(users.emailExists).mockResolvedValue(true);
    const res = await request(app).post("/api/users").set(authHeader()).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("UserPrincipalName, UserName, or Email already exists.");
  });

  it("lists users with string ids", async () => {
    vi.mocked(users.listUsers).mockResolvedValue([created]);
    const res = await request(app).get("/api/users").set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.users[0].id).toBe("9");
  });
});
