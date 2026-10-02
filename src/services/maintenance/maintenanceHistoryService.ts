import {
  findActiveCategoryName,
  findEmployeeDetail,
  findRequestEmployeeId,
  getProfileHistory,
  listActiveCategories,
  listActiveStatuses,
  listActiveTypes,
  listApprovalAuditLog,
  listCategoryDropdown,
  listRequestDetails,
  listStatusDropdown,
  listTypeDropdown,
  queryRequestById,
  type IdName,
} from "../../models/maintenance/maintenanceHistory.js";
import { toEssDate, toEssGuid } from "../../utils/essFormat.js";
import type { PagedResult } from "../../utils/essResponse.js";

// Port of ESS_Backend MaintenanceService (the withdraw endpoint stays on ESS).

const toDropdown = (rows: IdName[]) => rows.map((row) => ({ id: String(row.id), code: "", name: row.name }));

export async function getCategoryDropdown() {
  return toDropdown(await listCategoryDropdown());
}

export async function getTypeDropdown() {
  return toDropdown(await listTypeDropdown());
}

export async function getStatusDropdown() {
  return toDropdown(await listStatusDropdown());
}

// ---- Helpers ------------------------------------------------------------------------------

// int.TryParse: optional whitespace and sign, Int32 range.
function tryParseInt(value: string | null | undefined) {
  if (value == null || !/^\s*[+-]?\d+\s*$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= -2_147_483_648 && parsed <= 2_147_483_647 ? parsed : null;
}

function toDbString(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// DateTime.TryParseExact for the fixed formats below (two-digit day/month, four-digit year).
function parseExactDate(text: string, format: "dd/MM/yyyy" | "yyyy/MM/dd" | "yyyy-MM-dd" | "MM/dd/yyyy") {
  const patterns = {
    "dd/MM/yyyy": /^(\d{2})\/(\d{2})\/(\d{4})$/,
    "yyyy/MM/dd": /^(\d{4})\/(\d{2})\/(\d{2})$/,
    "yyyy-MM-dd": /^(\d{4})-(\d{2})-(\d{2})$/,
    "MM/dd/yyyy": /^(\d{2})\/(\d{2})\/(\d{4})$/,
  };
  const match = patterns[format].exec(text);
  if (!match) return null;
  const [a, b, c] = match.slice(1).map(Number);
  const [y, m, d] =
    format === "dd/MM/yyyy" ? [c, b, a] : format === "MM/dd/yyyy" ? [c, a, b] : [a, b, c];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1) return null;
  return { y, m, d };
}

// ESS NormalizeDateFilter: first matching exact format wins, re-emitted as yyyy/MM/dd;
// anything else is passed to the proc as typed.
function normalizeDateFilter(value: string | undefined) {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  for (const format of ["dd/MM/yyyy", "yyyy/MM/dd", "yyyy-MM-dd", "MM/dd/yyyy"] as const) {
    const parsed = parseExactDate(trimmed, format);
    if (parsed) return `${pad(parsed.y, 4)}/${pad(parsed.m)}/${pad(parsed.d)}`;
  }
  return trimmed;
}

// Field values whose name contains "Date" are re-formatted from yyyy/MM/dd to dd/MM/yyyy.
function normalizeDetailValue(fieldName: string | null, value: string | null) {
  if (!value || !value.trim()) return "";
  if (fieldName?.toLowerCase().includes("date")) {
    const parsed = parseExactDate(value.trim(), "yyyy/MM/dd");
    if (parsed) return `${pad(parsed.d)}/${pad(parsed.m)}/${pad(parsed.y, 4)}`;
  }
  return value.trim();
}

function byId(rows: IdName[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

// ToDictionaryAsync(Name, Id, OrdinalIgnoreCase) throws on duplicate names; mirror that.
function categoryIdsByName(rows: IdName[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (map.has(key)) {
      throw new Error(`An item with the same key has already been added. Key: ${row.name}`);
    }
    map.set(key, row.id);
  }
  return map;
}

function resolveName(code: number | null, names: Map<number, string>, fallback: string | null) {
  return code !== null && names.has(code) ? names.get(code)! : (fallback ?? "");
}

function categoryCode(category: string, ids: Map<string, number>) {
  return category.trim() && ids.has(category.toLowerCase()) ? ids.get(category.toLowerCase())! : null;
}

// ---- Queries ------------------------------------------------------------------------------

export async function getHistory(params: {
  employeeId?: string;
  currentEmployeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  requestCategory?: number;
  requestType?: number;
  requestStatus?: number;
  areaCode?: string;
  subAreaCode?: string;
  page: number;
  pageSize: number;
}) {
  const { page, pageSize } = params;
  const employeeId = params.employeeId ?? params.currentEmployeeId;
  if (!employeeId) {
    return { items: [], page, pageSize, totalCount: 0 };
  }

  const requestCategoryName =
    params.requestCategory !== undefined ? await findActiveCategoryName(params.requestCategory) : null;
  const types = byId(await listActiveTypes());
  const statuses = byId(await listActiveStatuses());

  const rows = await getProfileHistory({
    employeeId,
    startDate: toDbString(normalizeDateFilter(params.dateFrom)),
    endDate: toDbString(normalizeDateFilter(params.dateTo)),
    areaCode: toDbString(params.areaCode),
    subAreaCode: toDbString(params.subAreaCode),
    requestCategory: toDbString(requestCategoryName),
    requestType: params.requestType !== undefined ? String(params.requestType) : null,
    requestStatus: params.requestStatus !== undefined ? String(params.requestStatus) : null,
  });

  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize).map((row) => {
    const requestTypeCode = tryParseInt(row.RequestType);
    const requestStatusCode = tryParseInt(row.RequestStatus);
    return {
      requestId: toEssGuid(row.RequestID)!,
      requestNo: row.RequestNo ?? "",
      requestCategory: row.RequestCategory ?? "",
      // ESS echoes the requested category id (0 when none) rather than resolving each row.
      requestCategoryCode: params.requestCategory ?? 0,
      requestType: resolveName(requestTypeCode, types, row.RequestType),
      requestTypeCode,
      requestStatus: resolveName(requestStatusCode, statuses, row.RequestStatus),
      requestStatusCode,
      createdDate: toEssDate(row.CreatedDate),
    };
  });

  const result: PagedResult<(typeof items)[number]> = { items, page, pageSize, totalCount: rows.length };
  return result;
}

export async function getDetail(requestId: string) {
  const types = byId(await listActiveTypes());
  const statuses = byId(await listActiveStatuses());
  const categories = categoryIdsByName(await listActiveCategories());

  const row = (await queryRequestById(requestId))[0];
  if (!row) return null;

  const requestCategory = row.RequestCategory ?? "";
  const requestTypeCode = tryParseInt(row.RequestType);
  const requestStatusCode = tryParseInt(row.RequestStatus);
  return {
    requestId: toEssGuid(row.RequestID)!,
    requestNo: row.RequestNo ?? "",
    requestCategory,
    requestCategoryCode: categoryCode(requestCategory, categories),
    requestType: resolveName(requestTypeCode, types, row.RequestType),
    requestTypeCode,
    requestStatus: resolveName(requestStatusCode, statuses, row.RequestStatus),
    requestStatusCode,
    employeeId: toEssGuid(row.EmployeeID),
    employeeCode: row.EmployeeCode ?? "",
    employeeName: row.EmployeeName ?? "",
    companyName: row.CompanyName ?? "",
    companyCode: row.CompanyCode ?? "",
    areaName: row.AreaName ?? "",
    subAreaName: row.SubAreaName ?? "",
    currentApprovers: row.CurrentApprovers ?? "",
    lastActionDate: toEssDate(row.Date),
  };
}

export async function getDetailList(requestId: string) {
  const types = byId(await listActiveTypes());
  const categories = categoryIdsByName(await listActiveCategories());

  const rows = await listRequestDetails(requestId);
  return rows.map((row) => {
    const requestCategory = row.RequestCategory ?? "";
    const requestTypeCode = tryParseInt(row.RequestType);
    return {
      detailId: toEssGuid(row.DetailID)!,
      requestCategory,
      requestCategoryCode: categoryCode(requestCategory, categories),
      requestType: resolveName(requestTypeCode, types, row.RequestType),
      requestTypeCode,
      fieldName: row.FieldName ?? "",
      oldValue: normalizeDetailValue(row.FieldName, row.OldValue),
      newValue: normalizeDetailValue(row.FieldName, row.NewValue),
      documents: row.Documents ?? 0,
      position: row.Position,
    };
  });
}

export async function getAuditLogs(requestId: string) {
  const rows = await listApprovalAuditLog(requestId);
  return rows.map((row) => ({
    actionerId: toEssGuid(row.ActionerId),
    employeeName: row.EmployeeName,
    employeeCode: row.EmployeeCode,
    comment: row.Comment,
    activityAction: row.ActivityAction,
    activityName: row.ActivityName,
    createdDate: toEssDate(row.CreatedDate),
    sourceId: toEssGuid(row.SourceId)!,
    formattedDate: row.FormattedDate,
  }));
}

export async function getEmployee(requestId: string) {
  const employeeId = await findRequestEmployeeId(requestId);
  if (!employeeId) return null;

  const employee = await findEmployeeDetail(employeeId);
  if (!employee) return null;

  return {
    employeeCode: employee.employeeCode,
    employeeId: toEssGuid(employee.employeeId)!,
    employeeName: employee.employeeName,
    departmentCode: employee.areaCode,
    department: employee.areaName,
    unitSectionCode: employee.subAreaCode,
    unitSection: employee.subAreaName,
    positionCode: employee.positionCode,
    positionName: employee.positionName,
    joinDate: toEssDate(employee.joinDate),
    duty: employee.jobKeyName,
    managerName: employee.managerName,
  };
}
