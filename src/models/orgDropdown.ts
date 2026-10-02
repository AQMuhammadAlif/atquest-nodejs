import { prisma } from "./prisma.js";

// ESS DropDownListService: active rows ordered by Name.
const select = { id: true, code: true, name: true } as const;

export async function listCompanies() {
  return prisma.company.findMany({ where: { isActive: true }, select, orderBy: { name: "asc" } });
}

export async function listDivisions(companyId: number | null) {
  return prisma.division.findMany({
    where: { isActive: true, ...(companyId !== null ? { companyId } : {}) },
    select,
    orderBy: { name: "asc" },
  });
}

export async function listUnitSections(divisionId: number | null) {
  return prisma.unitSection.findMany({
    where: { isActive: true, ...(divisionId !== null ? { divisionId } : {}) },
    select,
    orderBy: { name: "asc" },
  });
}
