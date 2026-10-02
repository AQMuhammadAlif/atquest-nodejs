import { Router } from "express";
import * as controller from "../../controllers/maintenance/integrationStatusMaintenanceController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const integrationStatusMaintenanceRouter = Router();

integrationStatusMaintenanceRouter.get("/module-ddl", asyncHandler(controller.getModuleDdl));
integrationStatusMaintenanceRouter.get("/integration-status-ddl", asyncHandler(controller.getIntegrationStatusDdl));
integrationStatusMaintenanceRouter.get("/request-status-ddl", asyncHandler(controller.getRequestStatusDdl));
integrationStatusMaintenanceRouter.get("/", asyncHandler(controller.search));
integrationStatusMaintenanceRouter.post("/retrigger", asyncHandler(controller.retrigger));
