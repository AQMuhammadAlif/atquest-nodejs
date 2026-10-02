import { Router } from "express";
import * as controller from "../../controllers/routingManagement/reAssignTaskController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { essEndpoint } from "../../utils/essResponse.js";

// /v1/reassigntask (ReAssignTaskController)
export const reAssignTaskRouter = Router();

essEndpoint(reAssignTaskRouter, "/processes", { GET: [asyncHandler(controller.getProcessGroups)] });
essEndpoint(reAssignTaskRouter, "/search", { GET: [asyncHandler(controller.search)] });
essEndpoint(reAssignTaskRouter, "/reassign", { POST: [asyncHandler(controller.reAssign)] });
