import { Request, Response } from "express";
import * as service from "../../services/maintenance/notificationMaintenanceService.js";
import { HttpError } from "../../utils/errors.js";
import { MAINTENANCE_MAX_PAGE_SIZE, queryGuid, queryInt, queryString, resolvePaging } from "../../utils/essRequest.js";
import { essCreated, essOk } from "../../utils/essResponse.js";

// Port of ESS_Backend NotificationMaintenanceController (/v1/notification-maintenance).
const MODULE_NAME = "Notification Maintenance";

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
    subject: queryString(req, "subject"),
    routingId,
    routingRuleId,
    ...paging,
  });
  essOk(res, data, `${MODULE_NAME} retrieved.`);
}

export async function getRoutingRuleDdl(req: Request, res: Response) {
  essOk(res, await service.getRoutingRuleDdl(queryGuid(req, "routingId")), "Routing rules retrieved.");
}

export async function getAssignToDdl(_req: Request, res: Response) {
  essOk(res, await service.getAssignToDropdown(), "Assign-to dropdown retrieved.");
}

export async function getById(req: Request, res: Response) {
  const item = await service.getById(req.params.id as string);
  if (!item) {
    throw new HttpError(404, "Notification template not found.");
  }
  essOk(res, item, "Notification template retrieved.");
}

export async function create(req: Request, res: Response) {
  const item = await service.create(req.body, req.employeeId);
  const location = `${req.protocol}://${req.get("host")}/v1/notification-maintenance/${item.id}`;
  essCreated(res, item, "Notification template created.", location);
}

export async function update(req: Request, res: Response) {
  const item = await service.update(req.params.id as string, req.body, req.employeeId);
  essOk(res, item, "Notification template updated.");
}

export async function remove(req: Request, res: Response) {
  await service.remove(req.params.id as string);
  essOk(res, null, "Notification template deleted.");
}
