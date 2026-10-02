import { Router } from "express";
import * as controller from "../../controllers/maintenance/maintenanceHistoryController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { guidParam } from "../../utils/essRequest.js";

// Mounted at /v1/employee. The withdraw endpoint is not migrated.
export const maintenanceHistoryRouter = Router();

const requestId = guidParam("requestId");

maintenanceHistoryRouter.get("/maintenance-category-ddl", asyncHandler(controller.getCategoryDropdown));
maintenanceHistoryRouter.get("/maintenance-type-ddl", asyncHandler(controller.getTypeDropdown));
maintenanceHistoryRouter.get("/maintenance-status-ddl", asyncHandler(controller.getStatusDropdown));
maintenanceHistoryRouter.get("/maintenance-history", asyncHandler(controller.getHistory));
maintenanceHistoryRouter.get("/maintenance-history/:requestId", requestId, asyncHandler(controller.getDetail));
maintenanceHistoryRouter.get("/maintenance-history/:requestId/details", requestId, asyncHandler(controller.getDetailList));
maintenanceHistoryRouter.get("/maintenance-history/:requestId/audit-logs", requestId, asyncHandler(controller.getAuditLogs));
maintenanceHistoryRouter.get("/maintenance-history/:requestId/employee", requestId, asyncHandler(controller.getEmployee));
