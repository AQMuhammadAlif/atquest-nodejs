import { z } from "zod";
import { findEmployeeByLoginName } from "../models/employee.js";
import { findAuthProviderById, findUserByUserNameOrEmail, updateLoginState } from "../models/user.js";
import { HttpError } from "../utils/errors.js";
import { toEssGuid } from "../utils/essFormat.js";
import { verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/token.js";

// Mirrors ESS_Backend UserAuthService.LoginAsync + UserAuthController.Login.
const LOCAL_AUTH_PROVIDER_CODE = "LOCAL";

// `email` is accepted as an alias so existing atquest clients keep working.
const loginSchema = z.object({
  userNameOrEmail: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});

function maxFailedLogins() {
  return Number(process.env.AUTH_MAX_FAILED_LOGINS ?? 5);
}

function lockMinutes() {
  return Number(process.env.AUTH_LOCK_MINUTES ?? 15);
}

// ESS UserSessionService.GetEmployeeIdAsync: General.Employee.LoginName = rbac.Users.UserName.
async function resolveEmployeeId(userName: string) {
  const loginName = userName.trim();
  const employee = loginName ? await findEmployeeByLoginName(loginName) : null;
  if (!employee) {
    throw new HttpError(404, "Employee not found.");
  }
  if (employee.employeeStatus?.toLowerCase() !== "active") {
    throw new HttpError(403, "Employee is inactive.");
  }
  return toEssGuid(employee.employeeId)!;
}

export async function login(input: unknown) {
  const body = loginSchema.parse(input ?? {});
  const identifier = (body.userNameOrEmail ?? body.email ?? "").trim();
  const password = body.password ?? "";

  if (!identifier || !password) {
    throw new HttpError(401, "Invalid credentials.");
  }

  const user = await findUserByUserNameOrEmail(identifier);
  if (!user) {
    throw new HttpError(401, "Invalid credentials.");
  }

  if (!user.isActive) {
    throw new HttpError(403, "User is inactive.");
  }

  const authProvider = await findAuthProviderById(user.authProviderId);
  if (authProvider?.authProviderCode.toUpperCase() !== LOCAL_AUTH_PROVIDER_CODE) {
    throw new HttpError(403, "Only LOCAL auth provider supports password login.");
  }

  if (user.isLocked) {
    // Auto-unlock only when the lock came from the failed-login window and it has elapsed.
    const unlockAt = user.lockedAt ? user.lockedAt.getTime() + lockMinutes() * 60_000 : null;
    if (unlockAt === null || Date.now() < unlockAt) {
      throw new HttpError(403, "User is locked.");
    }
    await updateLoginState(user.userId, { failedLoginCount: 0, isLocked: false, lockedAt: null });
    user.failedLoginCount = 0;
  }

  if (!user.passwordHash?.trim() || !user.passwordSalt?.trim()) {
    throw new HttpError(403, "Password is not set for this user.");
  }

  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lock = maxFailedLogins() > 0 && failedLoginCount >= maxFailedLogins();
    await updateLoginState(user.userId, {
      failedLoginCount,
      isLocked: lock,
      lockedAt: lock ? new Date() : null,
    });
    throw new HttpError(lock ? 403 : 401, lock ? "User is locked." : "Invalid credentials.");
  }

  await updateLoginState(user.userId, {
    failedLoginCount: 0,
    isLocked: false,
    lockedAt: null,
    lastLoginAt: new Date(),
  });

  const employeeId = await resolveEmployeeId(user.userName);

  return {
    token: signToken(user.userId.toString(), { userName: user.userName, email: user.email, employeeId }),
    user: {
      id: user.userId.toString(),
      employeeId,
      userName: user.userName,
      email: user.email,
      name: user.displayName,
      createdAt: user.createdAt,
    },
  };
}
