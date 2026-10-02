import { prisma, sqlParam } from "../prisma.js";

export type IdName = { id: number; name: string };

const idName = { id: true, name: true } as const;

// ---- General.Maintenance* lookups --------------------------------------------------------

export async function listCategoryDropdown() {
  return prisma.maintenanceCategory.findMany({
    where: { isActive: true, name: { not: "Office Address" } },
    select: idName,
    orderBy: { name: "asc" },
  });
}

export async function listTypeDropdown() {
  return prisma.maintenanceType.findMany({ where: { isActive: true }, select: idName, orderBy: { name: "asc" } });
}

export async function listStatusDropdown() {
  return prisma.maintenanceStatus.findMany({ where: { isActive: true }, select: idName, orderBy: { name: "asc" } });
}

export async function listActiveCategories() {
  return prisma.maintenanceCategory.findMany({ where: { isActive: true }, select: idName });
}

export async function listActiveTypes() {
  return prisma.maintenanceType.findMany({ where: { isActive: true }, select: idName });
}

export async function listActiveStatuses() {
  return prisma.maintenanceStatus.findMany({ where: { isActive: true }, select: idName });
}

export async function findActiveCategoryName(id: number) {
  const row = await prisma.maintenanceCategory.findFirst({ where: { id, isActive: true }, select: { name: true } });
  return row?.name ?? null;
}

// ---- Stored procedures --------------------------------------------------------------------

export type ProfileHistoryRow = {
  RequestID: string;
  RequestNo: string | null;
  RequestCategory: string | null;
  RequestType: string | null;
  RequestStatus: string | null;
  CreatedDate: Date | null;
};

export async function getProfileHistory(params: {
  employeeId: string;
  startDate: string | null;
  endDate: string | null;
  areaCode: string | null;
  subAreaCode: string | null;
  requestCategory: string | null;
  requestType: string | null;
  requestStatus: string | null;
}) {
  return prisma.$queryRaw<ProfileHistoryRow[]>`
    EXEC [Employee].[Request_ProfileHistory_UNITEN]
      ${params.employeeId},
      ${sqlParam(params.startDate)},
      ${sqlParam(params.endDate)},
      ${sqlParam(params.areaCode)},
      ${sqlParam(params.subAreaCode)},
      ${sqlParam(params.requestCategory)},
      ${sqlParam(params.requestType)},
      ${sqlParam(params.requestStatus)}`;
}

export type RequestQueryRow = {
  RequestID: string;
  RequestNo: string | null;
  RequestCategory: string | null;
  RequestType: string | null;
  RequestStatus: string | null;
  EmployeeID: string | null;
  EmployeeCode: string | null;
  EmployeeName: string | null;
  CompanyName: string | null;
  CompanyCode: string | null;
  AreaName: string | null;
  SubAreaName: string | null;
  CurrentApprovers: string | null;
  Date: Date | null;
};

// Only @RequestID is supplied; every other filter is NULL, as in ESS.
export async function queryRequestById(requestId: string) {
  const NULL = sqlParam(null);
  return prisma.$queryRaw<RequestQueryRow[]>`
    EXEC [Employee].[Request_Query_UNITEN]
      ${NULL}, ${NULL}, ${NULL}, ${NULL}, ${NULL}, ${NULL}, ${NULL}, ${NULL},
      ${requestId},
      ${NULL}`;
}

export type RequestDetailRow = {
  DetailID: string;
  RequestCategory: string | null;
  RequestType: string | null;
  FieldName: string | null;
  OldValue: string | null;
  NewValue: string | null;
  Documents: number | null;
  Position: number;
};

export async function listRequestDetails(requestId: string) {
  return prisma.$queryRaw<RequestDetailRow[]>`EXEC [Employee].[RequestDetail_List_UNITEN] ${requestId}`;
}

export type AuditLogRow = {
  ActionerId: string | null;
  EmployeeName: string | null;
  EmployeeCode: string | null;
  Comment: string | null;
  ActivityAction: string | null;
  ActivityName: string | null;
  CreatedDate: Date | null;
  SourceId: string;
  FormattedDate: string | null;
};

// Cross-database view read over the SEPESS connection (same SQL Server instance).
export async function listApprovalAuditLog(sourceId: string) {
  return prisma.$queryRaw<AuditLogRow[]>`
    SELECT
      [ActionerID] AS [ActionerId],
      [EmployeeName],
      [EmployeeCode],
      [Comment],
      [ActivityAction],
      [ActivityName],
      [CreatedDate],
      [SourceID] AS [SourceId],
      [FormattedDate]
    FROM [SEPRoutingManagement].[RM].[GetApprovalAuditLog]
    WHERE [SourceID] = ${sourceId}
    ORDER BY [CreatedDate]`;
}

export async function findRequestEmployeeId(requestId: string) {
  const rows = await prisma.$queryRaw<{ Value: string | null }[]>`
    SELECT [EmployeeId] AS [Value]
    FROM [Employee].[Request]
    WHERE [RequestId] = ${requestId}`;
  return rows[0]?.Value ?? null;
}

export async function findEmployeeDetail(employeeId: string) {
  return prisma.employee.findUnique({
    where: { employeeId },
    select: {
      employeeId: true,
      employeeCode: true,
      employeeName: true,
      areaCode: true,
      areaName: true,
      subAreaCode: true,
      subAreaName: true,
      positionCode: true,
      positionName: true,
      joinDate: true,
      jobKeyName: true,
      managerName: true,
    },
  });
}
