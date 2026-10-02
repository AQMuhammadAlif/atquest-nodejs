import { Router } from "express";
import * as controller from "../controllers/approvalMaintenanceController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { guidParam } from "../utils/essRequest.js";

export const approvalMaintenanceRouter = Router();

approvalMaintenanceRouter.get("/", asyncHandler(controller.getAll));
approvalMaintenanceRouter.get("/routing-ddl", asyncHandler(controller.getRoutingDropdown));
approvalMaintenanceRouter.get("/routing-rule-ddl", asyncHandler(controller.getRoutingRuleDdl));
approvalMaintenanceRouter.get("/assign-to-ddl", asyncHandler(controller.getAssignToDropdown));
approvalMaintenanceRouter.get("/approval-step-ddl", asyncHandler(controller.getApprovalStepDropdown));
approvalMaintenanceRouter.get("/employee-picker", asyncHandler(controller.getEmployeePicker));
approvalMaintenanceRouter.get("/:id", guidParam("id"), asyncHandler(controller.getById));
approvalMaintenanceRouter.post("/", asyncHandler(controller.create));
approvalMaintenanceRouter.put("/:id", guidParam("id"), asyncHandler(controller.update));
approvalMaintenanceRouter.delete("/:id", guidParam("id"), asyncHandler(controller.remove));
