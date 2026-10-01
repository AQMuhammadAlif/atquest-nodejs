import { prisma } from "./prisma.js";

const publicUserSelect = {
  userId: true,
  userName: true,
  email: true,
  displayName: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: publicUserSelect,
    orderBy: { displayName: "asc" },
  });
}

export async function findUserByUserNameOrEmail(input: string) {
  return prisma.user.findFirst({
    where: { OR: [{ userName: input }, { email: input }] },
  });
}

export async function findAuthProviderById(authProviderId: bigint) {
  return prisma.authProvider.findUnique({ where: { authProviderId } });
}

export async function authProviderExists(authProviderId: bigint) {
  return (await prisma.authProvider.count({ where: { authProviderId } })) > 0;
}

export async function countRolesByIds(roleIds: bigint[]) {
  return prisma.role.count({ where: { roleId: { in: roleIds } } });
}

export async function userNameExists(userName: string) {
  return (await prisma.user.count({ where: { userName } })) > 0;
}

export async function emailExists(email: string) {
  return (await prisma.user.count({ where: { email } })) > 0;
}

export async function userPrincipalNameExists(userPrincipalName: string) {
  return (await prisma.user.count({ where: { userPrincipalName } })) > 0;
}

export async function updateLoginState(
  userId: bigint,
  data: {
    failedLoginCount: number;
    isLocked: boolean;
    lockedAt: Date | null;
    lastLoginAt?: Date;
  },
) {
  await prisma.user.update({ where: { userId }, data });
}

export async function insertUserWithRoles(
  data: {
    userPrincipalName: string | null;
    authProviderId: bigint;
    externalSubject: string | null;
    userName: string;
    email: string;
    displayName: string;
    isActive: boolean;
    isLocked: boolean;
    passwordHash: string;
    passwordSalt: string;
    mustChangePassword: boolean;
    actor: string;
    now: Date;
  },
  roleIds: bigint[],
) {
  const { actor, now, ...columns } = data;
  return prisma.user.create({
    data: {
      ...columns,
      passwordLastChangedAt: now,
      failedLoginCount: 0,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
      userRoles: {
        create: roleIds.map((roleId) => ({
          roleId,
          isActive: true,
          createdAt: now,
          createdBy: actor,
          updatedAt: now,
          updatedBy: actor,
        })),
      },
    },
    select: publicUserSelect,
  });
}
