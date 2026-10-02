import { prisma } from "./prisma.js";

export async function findEmployeeByLoginName(loginName: string) {
  return prisma.employee.findFirst({
    where: { loginName },
    select: { employeeId: true, employeeStatus: true },
  });
}

// ESS CoreService.IsInGroupAsync: runs over the TNBESSDB connection with a 3-part name,
// so SharePointDBEss must live on the same SQL Server instance.
export async function isInGroup(employeeId: string, groupName: string) {
  const rows = await prisma.$queryRaw<unknown[]>`EXEC [SharePointDBEss].[uniten].[IsInGroup] ${groupName}, ${employeeId}`;
  return rows.length > 0;
}
