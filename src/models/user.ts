import { prisma } from "./prisma.js";

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function insertUser(data: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  return prisma.user.create({
    data,
    select: { id: true, email: true, name: true, createdAt: true },
  });
}
