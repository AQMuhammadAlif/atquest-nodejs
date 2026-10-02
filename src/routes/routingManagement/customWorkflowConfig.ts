import { Router } from "express";
import * as controller from "../../controllers/routingManagement/customWorkflowConfigController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { essEndpoint } from "../../utils/essResponse.js";

// /v1/customworkflowconfig (CustomWorkflowConfigController). Literal segments are registered before
// "{id}", matching ASP.NET's route precedence.
export const customWorkflowConfigRouter = Router();

essEndpoint(customWorkflowConfigRouter, "/search", { GET: [asyncHandler(controller.search)] });
essEndpoint(customWorkflowConfigRouter, "/flexibenefits-task/:requestId", { GET: [asyncHandler(controller.getTaskIdForFlexiBenefits)] });
essEndpoint(customWorkflowConfigRouter, "/", { POST: [asyncHandler(controller.create)] });
essEndpoint(customWorkflowConfigRouter, "/:id", {
  GET: [asyncHandler(controller.getById)],
  PUT: [asyncHandler(controller.update)],
  DELETE: [asyncHandler(controller.remove)],
});
