import { Router } from "express";
import * as controller from "../../controllers/maintenance/approverRoleMaintenanceController.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const approverRoleMaintenanceRouter = Router();

approverRoleMaintenanceRouter.get("/module-ddl", asyncHandler(controller.getModules));
approverRoleMaintenanceRouter.get("/role-ddl", asyncHandler(controller.getRoles));
approverRoleMaintenanceRouter.get("/role-members", asyncHandler(controller.getRoleMembers));
approverRoleMaintenanceRouter.post("/role-members/single", asyncHandler(controller.addRoleMember));
approverRoleMaintenanceRouter.post("/role-members/multiple", asyncHandler(controller.addRoleMembers));
approverRoleMaintenanceRouter.delete("/role-members/single", asyncHandler(controller.deleteRoleMember));
approverRoleMaintenanceRouter.delete("/role-members/multiple", asyncHandler(controller.deleteRoleMembers));
approverRoleMaintenanceRouter.get("/division-ddl", asyncHandler(controller.getDivisionDropdown));
approverRoleMaintenanceRouter.get("/department-ddl", asyncHandler(controller.getDepartmentDropdown));
approverRoleMaintenanceRouter.get("/unit-section-ddl", asyncHandler(controller.getUnitSectionDropdown));
approverRoleMaintenanceRouter.get("/people-picker", asyncHandler(controller.getPeoplePicker));
