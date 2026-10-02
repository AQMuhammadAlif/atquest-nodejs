import { Request, Response } from "express";
import * as service from "../../services/maintenance/integrationStatusMaintenanceService.js";
import { queryString } from "../../utils/essRequest.js";
import { essOk } from "../../utils/essResponse.js";

// Port of ESS_Backend IntegrationStatusMaintenanceController (/v1/integration-status-maintenance).
const MODULE_NAME = "Integration Status Maintenance";

export async function getModuleDdl(_req: Request, res: Response) {
  essOk(res, await service.getModuleDropdown(), "Integration module dropdown retrieved.");
}

export async function getIntegrationStatusDdl(_req: Request, res: Response) {
  essOk(res, service.getIntegrationStatusDropdown(), "Integration status dropdown retrieved.");
}

export async function getRequestStatusDdl(_req: Request, res: Response) {
  essOk(res, service.getRequestStatusDropdown(), "Request status dropdown retrieved.");
}

export async function search(req: Request, res: Response) {
  const data = await service.search({
    integrationStatus: queryString(req, "integrationStatus"),
    moduleCode: queryString(req, "moduleCode"),
    startDate: queryString(req, "startDate"),
    endDate: queryString(req, "endDate"),
    requestStatus: queryString(req, "requestStatus"),
  });
  essOk(res, data, `${MODULE_NAME} retrieved.`);
}

export async function retrigger(req: Request, res: Response) {
  essOk(res, await service.retrigger(req.body), "Integration status retriggered.");
}
