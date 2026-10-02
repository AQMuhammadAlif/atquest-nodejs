import { Request, Response } from "express";
import * as service from "../services/approvalMaintenanceService.js";
import * as peoplePicker from "../services/peoplePickerService.js";
import { HttpError } from "../utils/errors.js";
import { MAINTENANCE_MAX_PAGE_SIZE, queryGuid, queryInt, queryString, resolvePaging } from "../utils/essRequest.js";
import { essCreated, essOk } from "../utils/essResponse.js";

// Port of ESS_Backend ApprovalMaintenanceController (/v1/approval-maintenance).
const MODULE_NAME = "Approval Maintenance";

export async function getAll(req: Request, res: Response) {
  const routingId = queryGuid(req, "routingId");
  const routingRuleId = queryGuid(req, "routingRuleId");
  const paging = resolvePaging(
    {
      page: queryInt(req, "page"),
      pageSize: queryInt(req, "pageSize"),
      legacyPage: queryInt(req, "_page"),
      legacyPageSize: queryInt(req, "_limit"),
    },
    MAINTENANCE_MAX_PAGE_SIZE,
  );

  const data = await service.getAll({
    approvalName: queryString(req, "approvalName"),
    activityName: queryString(req, "activityName"),
    assignTo: queryString(req, "assignTo"),
    routingId,
    routingRuleId,
    ...paging,
  });
  essOk(res, data, `${MODULE_NAME} retrieved.`);
}

export async function getRoutingDropdown(_req: Request, res: Response) {
  essOk(res, await service.getRoutingDropdown(), "Routing dropdown retrieved.");
}

export async function getRoutingRuleDdl(req: Request, res: Response) {
  essOk(res, await service.getRoutingRuleDdl(queryGuid(req, "routingId")), "Routing rules retrieved.");
}

export async function getAssignToDropdown(_req: Request, res: Response) {
  essOk(res, await service.getAssignToDropdown(), "Assign-to dropdown retrieved.");
}

export async function getApprovalStepDropdown(_req: Request, res: Response) {
  essOk(res, service.getApprovalStepDropdown(), "Approval step dropdown retrieved.");
}

export async function getEmployeePicker(req: Request, res: Response) {
  const paging = resolvePaging({ page: queryInt(req, "page"), pageSize: queryInt(req, "pageSize") }, MAINTENANCE_MAX_PAGE_SIZE);
  const data = await peoplePicker.getList({
    empCode: queryString(req, "empCode"),
    empName: queryString(req, "empName"),
    searchType: queryString(req, "searchType"),
    currEmpId: queryString(req, "currEmpId"),
    ...paging,
  });
  essOk(res, data, "Employee picker results retrieved.");
}

export async function getById(req: Request, res: Response) {
  const item = await service.getById(req.params.id as string);
  if (!item) {
    throw new HttpError(404, "Approval maintenance record not found.");
  }
  essOk(res, item, "Approval maintenance record retrieved.");
}

export async function create(req: Request, res: Response) {
  const item = await service.create(req.body, req.employeeId);
  const location = `${req.protocol}://${req.get("host")}/v1/approval-maintenance/${item.id}`;
  essCreated(res, item, "Approval maintenance record created.", location);
}

export async function update(req: Request, res: Response) {
  const item = await service.update(req.params.id as string, req.body, req.employeeId);
  essOk(res, item, "Approval maintenance record updated.");
}

export async function remove(req: Request, res: Response) {
  await service.remove(req.params.id as string);
  essOk(res, null, "Approval maintenance record deleted.");
}
