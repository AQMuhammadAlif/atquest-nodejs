import { Router } from "express";
import * as controller from "../../controllers/routingManagement/processController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { essEndpoint } from "../../utils/essResponse.js";

// /v1/process (ProcessController)
export const processRouter = Router();

essEndpoint(processRouter, "/processes", {
  GET: [asyncHandler(controller.getProcesses)],
  POST: [asyncHandler(controller.createProcess)],
});
essEndpoint(processRouter, "/processes/:processId", {
  GET: [asyncHandler(controller.getProcess)],
  DELETE: [asyncHandler(controller.deleteProcess)],
});
essEndpoint(processRouter, "/processes/:processId/roles", {
  GET: [asyncHandler(controller.getProcessRoles)],
  POST: [asyncHandler(controller.addRoles)],
});
essEndpoint(processRouter, "/processes/:processId/routes", {
  GET: [asyncHandler(controller.getProcessRoutes)],
  POST: [asyncHandler(controller.addRoutes)],
});
essEndpoint(processRouter, "/roles", { GET: [asyncHandler(controller.getAllRoles)] });
essEndpoint(processRouter, "/routes", { GET: [asyncHandler(controller.getAllRoutes)] });
essEndpoint(processRouter, "/roles/:processRoleId", { DELETE: [asyncHandler(controller.deleteRole)] });
essEndpoint(processRouter, "/routes/:processRouteId", { DELETE: [asyncHandler(controller.deleteRoute)] });
essEndpoint(processRouter, "/processes-by-employee/:employeeId", { GET: [asyncHandler(controller.getProcessesByEmployee)] });
essEndpoint(processRouter, "/tasks", { GET: [asyncHandler(controller.getTasks)] });
essEndpoint(processRouter, "/tasks/:taskId", { GET: [asyncHandler(controller.getTask)] });
