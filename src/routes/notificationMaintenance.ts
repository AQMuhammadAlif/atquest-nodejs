import { Router } from "express";
import * as controller from "../controllers/notificationMaintenanceController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { guidParam } from "../utils/essRequest.js";

export const notificationMaintenanceRouter = Router();

notificationMaintenanceRouter.get("/", asyncHandler(controller.getAll));
notificationMaintenanceRouter.get("/routing-rule-ddl", asyncHandler(controller.getRoutingRuleDdl));
notificationMaintenanceRouter.get("/assign-to-ddl", asyncHandler(controller.getAssignToDdl));
notificationMaintenanceRouter.get("/:id", guidParam("id"), asyncHandler(controller.getById));
notificationMaintenanceRouter.post("/", asyncHandler(controller.create));
notificationMaintenanceRouter.put("/:id", guidParam("id"), asyncHandler(controller.update));
notificationMaintenanceRouter.delete("/:id", guidParam("id"), asyncHandler(controller.remove));
