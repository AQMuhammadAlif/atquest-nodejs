import { Request, Response } from "express";
import * as service from "../../services/maintenance/approverRoleMaintenanceService.js";
import * as peoplePicker from "../../services/peoplePickerService.js";
import { HttpError } from "../../utils/errors.js";
import { EMPTY_GUID, queryGuid, queryInt, queryString, resolvePaging } from "../../utils/essRequest.js";
import { essCreated, essOk } from "../../utils/essResponse.js";

// Port of ESS_Backend ApproverRoleMaintenanceController (/v1/approver-role-maintenance).
// Paging here clamps at Pagination:MaxPageSize (not the 500 used by other maintenance screens).
const DATA_RETRIEVED = "data retrieved.";

export async function getModules(req: Request, res: Response) {
  essOk(res, await service.getModules(req.employeeId), DATA_RETRIEVED);
}

export async function getRoles(req: Request, res: Response) {
  essOk(res, await service.getRoles(queryGuid(req, "moduleId"), req.employeeId), DATA_RETRIEVED);
}

export async function getRoleMembers(req: Request, res: Response) {
  const moduleId = queryGuid(req, "moduleId") ?? EMPTY_GUID;
  const roleId = queryGuid(req, "roleId") ?? EMPTY_GUID;
  const page = queryInt(req, "page");
  const pageSize = queryInt(req, "pageSize");

  if (moduleId === EMPTY_GUID) throw new HttpError(400, "ModuleId must be provided.");
  if (roleId === EMPTY_GUID) throw new HttpError(400, "RoleId must be provided.");

  const data = await service.getRoleMembers({
    moduleId,
    roleId,
    ...resolvePaging({ page, pageSize }),
    employeeId: req.employeeId,
  });
  essOk(res, data, DATA_RETRIEVED);
}

export async function addRoleMember(req: Request, res: Response) {
  essCreated(res, await service.addRoleMember(req.body, req.employeeId), "Role member created.");
}

export async function addRoleMembers(req: Request, res: Response) {
  essCreated(res, await service.addRoleMembers(req.body, req.employeeId), "Role members created.");
}

export async function deleteRoleMember(req: Request, res: Response) {
  await service.removeRoleMember(req.body);
  essOk(res, null, "Role member deleted.");
}

export async function deleteRoleMembers(req: Request, res: Response) {
  await service.removeRoleMembers(req.body);
  essOk(res, null, "Role members deleted.");
}

export async function getDivisionDropdown(_req: Request, res: Response) {
  essOk(res, await service.getDivisionDropdown(), DATA_RETRIEVED);
}

export async function getDepartmentDropdown(req: Request, res: Response) {
  essOk(res, await service.getDepartmentDropdown(queryInt(req, "divisionId")), DATA_RETRIEVED);
}

export async function getUnitSectionDropdown(req: Request, res: Response) {
  essOk(res, await service.getUnitSectionDropdown(queryInt(req, "departmentId")), DATA_RETRIEVED);
}

export async function getPeoplePicker(req: Request, res: Response) {
  if (!req.employeeId) {
    throw new HttpError(401, "Employee ID is unavailable for the current user.");
  }
  const data = await peoplePicker.getList({
    empCode: queryString(req, "empCode"),
    empName: queryString(req, "empName"),
    searchType: null,
    currEmpId: req.employeeId,
    ...resolvePaging({ page: queryInt(req, "page"), pageSize: queryInt(req, "pageSize") }),
  });
  essOk(res, data, DATA_RETRIEVED);
}
