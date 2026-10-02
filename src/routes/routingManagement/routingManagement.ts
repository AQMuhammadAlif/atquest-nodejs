import { Router } from "express";
import * as controller from "../../controllers/routingManagement/routingManagementController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { essEndpoint } from "../../utils/essResponse.js";

// /v1/routingmanagement (RoutingManagementController)
export const routingManagementRouter = Router();

essEndpoint(routingManagementRouter, "/teststartrouting", { POST: [asyncHandler(controller.testStartRouting)] });
essEndpoint(routingManagementRouter, "/getintray", { GET: [asyncHandler(controller.getInTray)] });
essEndpoint(routingManagementRouter, "/getmyintraysummary", { GET: [asyncHandler(controller.getMyIntraySummary)] });
essEndpoint(routingManagementRouter, "/getmyapprovalhistory", { GET: [asyncHandler(controller.getMyApprovalHistory)] });
essEndpoint(routingManagementRouter, "/perform-action", { POST: [asyncHandler(controller.performAction)] });
essEndpoint(routingManagementRouter, "/goto-activity", { POST: [asyncHandler(controller.gotoActivity)] });
essEndpoint(routingManagementRouter, "/withdraw", { POST: [asyncHandler(controller.withdraw)] });
essEndpoint(routingManagementRouter, "/cancel", { POST: [asyncHandler(controller.cancel)] });
essEndpoint(routingManagementRouter, "/allow-actions", { GET: [asyncHandler(controller.getAllowActions)] });
essEndpoint(routingManagementRouter, "/task/:id", { GET: [asyncHandler(controller.getTask)] });
essEndpoint(routingManagementRouter, "/audit-log", { GET: [asyncHandler(controller.getAuditLog)] });
essEndpoint(routingManagementRouter, "/workflow-history", { POST: [asyncHandler(controller.insertWorkflowHistory)] });
essEndpoint(routingManagementRouter, "/restartrouting", { POST: [asyncHandler(controller.restartRouting)] });
