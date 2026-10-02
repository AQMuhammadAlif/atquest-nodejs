import { prisma, sqlParam } from "./prisma.js";

// ESS EmployeeDetailService (General.GetPeoplePicker + Employees lookup).

export type PeoplePickerRow = {
  EmployeeID: string;
  EmployeeCode: string | null;
  EmployeeName: string | null;
  AreaName: string | null;
  SubAreaName: string | null;
  PositionCode: string | null;
  PositionName: string | null;
  JobKeyName: string | null;
  JoinDate: Date | null;
  ManagerName: string | null;
};

export async function searchPeoplePicker(params: {
  employeeCode: string | null;
  employeeName: string | null;
  searchType: string | null;
  currEmployeeId: string | null;
}) {
  return prisma.$queryRaw<PeoplePickerRow[]>`
    EXEC [General].[GetPeoplePicker]
      ${sqlParam(params.employeeCode)},
      ${sqlParam(params.employeeName)},
      ${sqlParam(params.searchType)},
      ${sqlParam(params.currEmployeeId)}`;
}

export async function employeeExists(employeeId: string) {
  return (await prisma.employee.count({ where: { employeeId } })) > 0;
}
