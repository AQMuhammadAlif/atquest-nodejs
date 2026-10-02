import { prisma, sqlParam } from "../prisma.js";

// ESS passes every GUID to these procs as a string (the parameters are VARCHAR(36)).

export type ValueTextRow = { Value: string; Text: string | null };

export type RoleMemberRow = {
  ID: string;
  ModuleID: string | null;
  ModuleName: string | null;
  RoleID: string;
  RoleName: string | null;
  EmployeeID: string | null;
  EmployeeCode: string | null;
  EmployeeName: string | null;
  DivisionCode: string | null;
  DepartmentCode: string | null;
  UnitSectionCode: string | null;
};

export type RoleMemberInput = {
  id: string;
  roleId: string;
  employeeId: string;
  divisionCode: string | null;
  departmentCode: string | null;
  unitSectionCode: string | null;
  actionerId: string;
};

export async function getModules(actionerId: string, isEssAdmin: boolean) {
  return prisma.$queryRaw<ValueTextRow[]>`EXEC [General].[Role_GetModules] ${actionerId}, ${isEssAdmin}`;
}

export async function getRoles(actionerId: string, moduleId: string, isEssAdmin: boolean) {
  return prisma.$queryRaw<ValueTextRow[]>`EXEC [General].[Role_GetRoles] ${actionerId}, ${moduleId}, ${isEssAdmin}`;
}

export async function findRoleInModule(roleId: string, moduleId: string) {
  return prisma.generalRole.findFirst({
    where: { id: roleId, applicationId: moduleId },
    select: { id: true, roleCode: true, roleDesc: true, needHierarchy: true },
  });
}

export async function getRoleMembers(moduleId: string, roleId: string, isEssAdmin: boolean, actionerId: string) {
  return prisma.$queryRaw<RoleMemberRow[]>`
    EXEC [General].[GetRoleMembers2] ${moduleId}, ${roleId}, ${isEssAdmin}, ${actionerId}`;
}

type RawExecutor = Pick<typeof prisma, "$executeRaw">;

function execSave(db: RawExecutor, member: RoleMemberInput) {
  return db.$executeRaw`
    EXEC [General].[RoleMember_Save]
      ${member.id},
      ${member.roleId},
      ${member.employeeId},
      ${sqlParam(member.divisionCode)},
      ${sqlParam(member.departmentCode)},
      ${sqlParam(member.unitSectionCode)},
      ${member.actionerId}`;
}

function execDelete(db: RawExecutor, id: string) {
  return db.$executeRaw`EXEC [General].[RoleMember_Delete] ${id}`;
}

export async function saveRoleMember(member: RoleMemberInput) {
  await execSave(prisma, member);
}

// All-or-nothing, like ESS's explicit transaction around the loop.
export async function saveRoleMembers(members: RoleMemberInput[]) {
  await prisma.$transaction(async (tx) => {
    for (const member of members) await execSave(tx, member);
  });
}

export async function deleteRoleMember(id: string) {
  await execDelete(prisma, id);
}

export async function deleteRoleMembers(ids: string[]) {
  await prisma.$transaction(async (tx) => {
    for (const id of ids) await execDelete(tx, id);
  });
}
