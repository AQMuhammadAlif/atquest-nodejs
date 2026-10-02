import { Router } from "express";
import { requireEssAuth } from "../middleware/auth.js";
import { essCurrentUser } from "../middleware/essCurrentUser.js";
import { essErrorHandler } from "../middleware/essErrors.js";
import { essReportApiVersions } from "../utils/essResponse.js";
import { maintenanceRouter } from "./maintenance/index.js";
import { routingManagementModuleRouter } from "./routingManagement/index.js";

// Endpoints migrated from ESS_Backend keep its contract: /v1 (and /v1.0) paths, ApiResponse bodies.
// Authorization is authentication only (ESS RequirePermission checks are intentionally not ported);
// a missing or invalid token gets ESS's JwtBearer challenge (empty 401).
export const v1Router = Router();

v1Router.use(requireEssAuth, essReportApiVersions);

// Routing Management is mounted before essCurrentUser: its ESS controllers never read
// ICurrentUserService, so (as in ESS) an X-Act-As-Employee-Id header triggers no SharePoint lookup.
v1Router.use(routingManagementModuleRouter);

v1Router.use(essCurrentUser);

// One router per migrated module.
v1Router.use(maintenanceRouter);

v1Router.use(essErrorHandler);

// No ESS endpoint matched: endpoint routing answers an empty 404.
v1Router.use((_req, res) => {
  res.removeHeader("api-supported-versions");
  res.status(404).end();
});
