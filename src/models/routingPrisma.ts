import { Prisma, PrismaClient } from "../generated/routing/index.js";

// SEPRoutingManagement (ROUTING_DATABASE_URL).
export const routingPrisma = new PrismaClient();

// Prisma binds a JS null as an int-typed NULL, which SQL Server refuses to convert to
// uniqueidentifier. Emit a literal NULL instead (what ESS's DBNull.Value achieves).
export function sqlParam(value: string | number | boolean | null) {
  return value === null ? Prisma.raw("NULL") : Prisma.sql`${value}`;
}
