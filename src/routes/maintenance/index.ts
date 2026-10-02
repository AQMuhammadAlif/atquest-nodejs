import { Router } from "express";
import { approvalMaintenanceRouter } from "./approvalMaintenance.js";
import { approverRoleMaintenanceRouter } from "./approverRoleMaintenance.js";
import { integrationStatusMaintenanceRouter } from "./integrationStatusMaintenance.js";
import { maintenanceHistoryRouter } from "./maintenanceHistory.js";
import { notificationMaintenanceRouter } from "./notificationMaintenance.js";

// Maintenance module (migrated from ESS_Backend). Mounted on /v1; keeps ESS's paths.
export const maintenanceRouter = Router();

maintenanceRouter.use("/notification-maintenance", notificationMaintenanceRouter);
maintenanceRouter.use("/approval-maintenance", approvalMaintenanceRouter);
maintenanceRouter.use("/approver-role-maintenance", approverRoleMaintenanceRouter);
maintenanceRouter.use("/integration-status-maintenance", integrationStatusMaintenanceRouter);
// MaintenanceHistoryController lives under ESS's /employee prefix.
maintenanceRouter.use("/employee", maintenanceHistoryRouter);
