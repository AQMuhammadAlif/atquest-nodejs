import { z } from "zod";
import {
  authProviderExists,
  countRolesByIds,
  emailExists,
  insertUserWithRoles,
  listUsers,
  userNameExists,
  userPrincipalNameExists,
} from "../models/user.js";
import { HttpError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";

// Mirrors ESS_Backend UserService.CreateAsync + UsersController.Create (rbac.Users).
const SYSTEM_USER = "system";

const id = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value) => BigInt(value));

const createSchema = z.object({
  userPrincipalName: z.string().max(256).nullish(),
  authProviderId: id,
  externalSubject: z.string().max(255).nullish(),
  userName: z.string().min(1).max(100),
  email: z.string().min(1).max(255),
  displayName: z.string().min(1).max(500),
  roleIds: z.array(id),
  password: z.string().min(1).max(200),
  isActive: z.boolean().nullish(),
  isLocked: z.boolean().nullish(),
  mustChangePassword: z.boolean().nullish(),
});

type PublicUser = {
  userId: bigint;
  userName: string;
  email: string;
  displayName: string;
  createdAt: Date;
};

function toUserDto(user: PublicUser) {
  return {
    id: user.userId.toString(),
    userName: user.userName,
    email: user.email,
    name: user.displayName,
    createdAt: user.createdAt,
  };
}

function normalizeNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function list() {
  return { users: (await listUsers()).map(toUserDto) };
}

export async function create(input: unknown) {
  const body = createSchema.parse(input);
  const roleIds = [...new Set(body.roleIds)];

  const validReference =
    (await authProviderExists(body.authProviderId)) &&
    roleIds.length > 0 &&
    (await countRolesByIds(roleIds)) === roleIds.length;
  if (!validReference) {
    throw new HttpError(400, "AuthProviderId or one/more RoleIds are invalid.");
  }

  const userName = body.userName.trim();
  const email = body.email.trim();
  const userPrincipalName = normalizeNullable(body.userPrincipalName);
  const conflict =
    (await userNameExists(userName)) ||
    (await emailExists(email)) ||
    (userPrincipalName !== null && (await userPrincipalNameExists(userPrincipalName)));
  if (conflict) {
    throw new HttpError(409, "UserPrincipalName, UserName, or Email already exists.");
  }

  const password = hashPassword(body.password);
  const user = await insertUserWithRoles(
    {
      userPrincipalName,
      authProviderId: body.authProviderId,
      externalSubject: normalizeNullable(body.externalSubject),
      userName,
      email,
      displayName: body.displayName.trim(),
      isActive: body.isActive ?? true,
      isLocked: body.isLocked ?? false,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      mustChangePassword: body.mustChangePassword ?? false,
      actor: SYSTEM_USER,
      now: new Date(),
    },
    roleIds,
  );

  return { user: toUserDto(user) };
}
