import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { essCurrentUser } from "../middleware/essCurrentUser.js";
import { essErrorHandler } from "../middleware/essErrors.js";
import { maintenanceRouter } from "./maintenance/index.js";

// Endpoints migrated from ESS_Backend keep its contract: /v1/... paths, ApiResponse bodies.
// Authorization is requireAuth only (ESS RequirePermission checks are intentionally not ported).
export const v1Router = Router();

v1Router.use(requireAuth, essCurrentUser);

// One router per migrated module.
v1Router.use(maintenanceRouter);

v1Router.use(essErrorHandler);
