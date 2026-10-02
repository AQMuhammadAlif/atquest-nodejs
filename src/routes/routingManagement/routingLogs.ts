import { Router } from "express";
import * as controller from "../../controllers/routingManagement/routingLogsController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { essEndpoint } from "../../utils/essResponse.js";

// /v1/routinglogs (RoutingLogsController)
export const routingLogsRouter = Router();

essEndpoint(routingLogsRouter, "/listing", { GET: [asyncHandler(controller.getListing)] });
essEndpoint(routingLogsRouter, "/detail/:id", { GET: [asyncHandler(controller.getDetail)] });
essEndpoint(routingLogsRouter, "/restart/:id", { POST: [asyncHandler(controller.restartRouting)] });
