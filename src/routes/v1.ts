import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { essCurrentUser } from "../middleware/essCurrentUser.js";
import { essErrorHandler } from "../middleware/essErrors.js";
import { approvalMaintenanceRouter } from "./approvalMaintenance.js";
import { notificationMaintenanceRouter } from "./notificationMaintenance.js";

// Endpoints migrated from ESS_Backend keep its contract: /v1/... paths, ApiResponse bodies.
// Authorization is requireAuth only (ESS RequirePermission checks are intentionally not ported).
export const v1Router = Router();

v1Router.use(requireAuth, essCurrentUser);

// Maintenance routers are mounted here as each controller is migrated.
v1Router.use("/notification-maintenance", notificationMaintenanceRouter);
v1Router.use("/approval-maintenance", approvalMaintenanceRouter);

v1Router.use(essErrorHandler);
