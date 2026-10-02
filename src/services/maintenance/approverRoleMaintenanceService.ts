import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  deleteRoleMember,
  deleteRoleMembers,
  findRoleInModule,
  getModules as getModuleRows,
  getRoleMembers as getRoleMemberRows,
  getRoles as getRoleRows,
  saveRoleMember,
  saveRoleMembers,
  type RoleMemberRow,
  type ValueTextRow,
} from "../../models/maintenance/approverRoleMaintenance.js";
import { isInGroup } from "../../models/employee.js";
import { listCompanies, listDivisions, listUnitSections } from "../../models/orgDropdown.js";
import { HttpError } from "../../utils/errors.js";
import { toEssGuid } from "../../utils/essFormat.js";
import { EMPTY_GUID } from "../../utils/essRequest.js";
import type { PagedResult } from "../../utils/essResponse.js";
import { essField, parseEssBody } from "../../utils/essValidation.js";

// Port of ESS_Backend ApproverRoleMaintenanceService, DropDownListService (company/division/
// unit-section) and the request checks in ApproverRoleMaintenanceController.

const ESS_ADMIN_GROUP = "ESS Admin";

// The ESS service throws UnauthorizedAccessException here, which GlobalExceptionMiddleware turns
// into a 500 (not a 401).
function requireEmployee(employeeId: string | undefined) {
  if (!employeeId) {
    throw new Error("Employee ID is unavailable for the current user.");
  }
  return employeeId;
}

const memberSchema = z.object({
  roleId: essField.guid(),
  employeeId: essField.guid(),
  divisionCode: essField.optionalString("DivisionCode", 200),
  departmentCode: essField.optionalString("DepartmentCode", 200),
  unitSectionCode: essField.optionalString("UnitSectionCode", 200),
});

const memberListSchema = z.array(memberSchema, {
  invalid_type_error: "The JSON value could not be converted to a list of role members.",
});

const deleteSchema = z.object({ id: essField.guid() });
const deleteListSchema = z.array(deleteSchema, {
  invalid_type_error: "The JSON value could not be converted to a list of role members.",
});

type MemberRequest = z.output<typeof memberSchema>;

function toValueTextDto(row: ValueTextRow) {
  return { id: toEssGuid(row.Value)!, code: "", name: row.Text ?? "" };
}

function toMemberDto(row: RoleMemberRow) {
  return {
    id: toEssGuid(row.ID)!,
    moduleId: toEssGuid(row.ModuleID),
    moduleName: row.ModuleName ?? "",
    roleId: toEssGuid(row.RoleID)!,
    roleName: row.RoleName ?? "",
    employeeId: toEssGuid(row.EmployeeID),
    employeeCode: row.EmployeeCode ?? "",
    employeeName: row.EmployeeName ?? "",
    divisionCode: row.DivisionCode ?? "",
    departmentCode: row.DepartmentCode ?? "",
    unitSectionCode: row.UnitSectionCode ?? "",
  };
}

function toDbString(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function toMemberInput(request: MemberRequest, actionerId: string) {
  return {
    id: randomUUID(),
    roleId: request.roleId,
    employeeId: request.employeeId,
    divisionCode: toDbString(request.divisionCode),
    departmentCode: toDbString(request.departmentCode),
    unitSectionCode: toDbString(request.unitSectionCode),
    actionerId,
  };
}

// ---- Lookups ------------------------------------------------------------------------------

export async function getModules(employeeId: string | undefined) {
  const actionerId = requireEmployee(employeeId);
  const isEssAdmin = await isInGroup(actionerId, ESS_ADMIN_GROUP);
  return (await getModuleRows(actionerId, isEssAdmin)).map(toValueTextDto);
}

export async function getRoles(moduleId: string | undefined, employeeId: string | undefined) {
  if (!moduleId || moduleId === EMPTY_GUID) {
    throw new HttpError(400, "ModuleId must be provided.");
  }
  const actionerId = requireEmployee(employeeId);
  const isEssAdmin = await isInGroup(actionerId, ESS_ADMIN_GROUP);
  return (await getRoleRows(actionerId, moduleId, isEssAdmin)).map(toValueTextDto);
}

export async function getRoleMembers(params: {
  moduleId: string | undefined;
  roleId: string | undefined;
  page: number;
  pageSize: number;
  employeeId: string | undefined;
}) {
  const { moduleId, roleId, page, pageSize } = params;
  const actionerId = requireEmployee(params.employeeId);

  const role = await findRoleInModule(roleId!, moduleId!);
  if (!role) {
    throw new HttpError(404, "Role not found for the selected module.");
  }

  const isEssAdmin = await isInGroup(actionerId, ESS_ADMIN_GROUP);
  const rows = await getRoleMemberRows(moduleId!, roleId!, isEssAdmin, actionerId);
  const start = (page - 1) * pageSize;

  const roleMembers: PagedResult<ReturnType<typeof toMemberDto>> = {
    items: rows.slice(start, start + pageSize).map(toMemberDto),
    page,
    pageSize,
    totalCount: rows.length,
  };

  return {
    roleDetail: {
      id: toEssGuid(role.id)!,
      roleCode: role.roleCode ?? "",
      roleName: role.roleDesc ?? "",
      needHierarchy: role.needHierarchy ?? true,
    },
    roleMembers,
  };
}

export async function getDivisionDropdown() {
  return (await listCompanies()).map((row) => ({ id: String(row.id), code: row.code, name: row.name }));
}

export async function getDepartmentDropdown(divisionId: number | undefined) {
  return (await listDivisions(divisionId ?? null)).map((row) => ({ id: String(row.id), code: row.code, name: row.name }));
}

export async function getUnitSectionDropdown(departmentId: number | undefined) {
  return (await listUnitSections(departmentId ?? null)).map((row) => ({
    id: String(row.id),
    code: row.code,
    name: row.name,
  }));
}

// ---- Commands -----------------------------------------------------------------------------

export async function addRoleMember(input: unknown, employeeId: string | undefined) {
  const request = parseEssBody(memberSchema, input);
  if (request.roleId === EMPTY_GUID) throw new HttpError(400, "RoleId must be provided.");
  if (request.employeeId === EMPTY_GUID) throw new HttpError(400, "EmployeeId must be provided.");

  const member = toMemberInput(request, requireEmployee(employeeId));
  await saveRoleMember(member);
  return { id: member.id };
}

export async function addRoleMembers(input: unknown, employeeId: string | undefined) {
  const requests = parseEssBody(memberListSchema, input);
  if (requests.length === 0) throw new HttpError(400, "At least one role member must be provided.");
  if (requests.some((request) => request.roleId === EMPTY_GUID)) {
    throw new HttpError(400, "RoleId must be provided for every role member.");
  }
  if (requests.some((request) => request.employeeId === EMPTY_GUID)) {
    throw new HttpError(400, "EmployeeId must be provided for every role member.");
  }

  const actionerId = requireEmployee(employeeId);
  const members = requests.map((request) => toMemberInput(request, actionerId));
  await saveRoleMembers(members);
  return members.map((member) => ({ id: member.id }));
}

export async function removeRoleMember(input: unknown) {
  const request = parseEssBody(deleteSchema, input);
  if (request.id === EMPTY_GUID) throw new HttpError(400, "Id must be provided.");
  await deleteRoleMember(request.id);
}

export async function removeRoleMembers(input: unknown) {
  const requests = parseEssBody(deleteListSchema, input);
  if (requests.length === 0) throw new HttpError(400, "At least one role member must be provided.");
  if (requests.some((request) => request.id === EMPTY_GUID)) {
    throw new HttpError(400, "Id must be provided for every role member.");
  }
  await deleteRoleMembers(requests.map((request) => request.id));
}
