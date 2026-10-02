import { Request, Response } from "express";
import * as service from "../../services/maintenance/maintenanceHistoryService.js";
import { HttpError } from "../../utils/errors.js";
import { queryGuid, queryInt, queryString, resolvePaging } from "../../utils/essRequest.js";
import { essOk } from "../../utils/essResponse.js";

// Port of ESS_Backend MaintenanceHistoryController (/v1/employee/...).
// POST maintenance-history/{requestId}/withdraw is intentionally not migrated (stays on ESS).

export async function getCategoryDropdown(_req: Request, res: Response) {
  essOk(res, await service.getCategoryDropdown(), "data retrieved.");
}

export async function getTypeDropdown(_req: Request, res: Response) {
  essOk(res, await service.getTypeDropdown(), "data retrieved.");
}

export async function getStatusDropdown(_req: Request, res: Response) {
  essOk(res, await service.getStatusDropdown(), "data retrieved.");
}

export async function getHistory(req: Request, res: Response) {
  const employeeId = queryGuid(req, "employeeId");
  const requestCategory = queryInt(req, "requestCategory");
  const requestType = queryInt(req, "requestType");
  const requestStatus = queryInt(req, "requestStatus");
  const paging = resolvePaging({ page: queryInt(req, "page"), pageSize: queryInt(req, "pageSize") });

  const data = await service.getHistory({
    employeeId,
    currentEmployeeId: req.employeeId,
    dateFrom: queryString(req, "dateFrom"),
    dateTo: queryString(req, "dateTo"),
    requestCategory,
    requestType,
    requestStatus,
    areaCode: queryString(req, "areaCode"),
    subAreaCode: queryString(req, "subAreaCode"),
    ...paging,
  });
  essOk(res, data, "Employee maintenance history retrieved.");
}

export async function getDetail(req: Request, res: Response) {
  const data = await service.getDetail(req.params.requestId as string);
  if (!data) {
    throw new HttpError(404, "Employee maintenance history detail not found.");
  }
  essOk(res, data, "Employee maintenance history detail retrieved.");
}

export async function getDetailList(req: Request, res: Response) {
  essOk(res, await service.getDetailList(req.params.requestId as string), "Employee maintenance history detail list retrieved.");
}

export async function getAuditLogs(req: Request, res: Response) {
  essOk(res, await service.getAuditLogs(req.params.requestId as string), "Employee maintenance history audit logs retrieved.");
}

export async function getEmployee(req: Request, res: Response) {
  const data = await service.getEmployee(req.params.requestId as string);
  if (!data) {
    throw new HttpError(404, "Employee not found.");
  }
  essOk(res, data, "Employee maintenance history employee retrieved.");
}
