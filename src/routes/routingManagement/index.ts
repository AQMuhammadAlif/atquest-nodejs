import { Router } from "express";
import { routingDbScope } from "../../middleware/routingManagement/routingDbScope.js";
import { customWorkflowConfigRouter } from "./customWorkflowConfig.js";
import { processRouter } from "./process.js";
import { reAssignTaskRouter } from "./reAssignTask.js";
import { routingLogsRouter } from "./routingLogs.js";
import { routingManagementRouter } from "./routingManagement.js";

// Routing Management module (migrated from ESS_Backend Controllers/RoutingManagement). Mounted on
// /v1; keeps ESS's paths. Each request gets its own SEPRoutingManagementDbContext.
export const routingManagementModuleRouter = Router();

routingManagementModuleRouter.use("/routingmanagement", routingDbScope, routingManagementRouter);
routingManagementModuleRouter.use("/routinglogs", routingDbScope, routingLogsRouter);
routingManagementModuleRouter.use("/reassigntask", routingDbScope, reAssignTaskRouter);
routingManagementModuleRouter.use("/process", routingDbScope, processRouter);
routingManagementModuleRouter.use("/customworkflowconfig", routingDbScope, customWorkflowConfigRouter);
