import { Request, Response } from "express";
import * as reRoutingService from "../../services/routingManagement/reRoutingService.js";
import { equalsOrdinalIgnoreCase, isNullOrWhiteSpace, orderByCulture } from "../../utils/essDotnet.js";
import { toEssJson } from "../../utils/essFormat.js";
import { queryString } from "../../utils/essRequest.js";
import { essFail, essOk } from "../../utils/essResponse.js";
import { bindEssJsonBody, EssBodySpec, EssModelState } from "../../utils/essValidation.js";

// Port of ESS_Backend Controllers/RoutingManagement/ProcessController.cs
// ([Route("v{version:apiVersion}/process")]). [RequirePermission] is not ported.

type CreateProcessRequest = { ProcessName: string; Description: string; UserId: string };

const createProcessRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.CreateProcessRequest",
  create: () => ({ ProcessName: "", Description: "", UserId: "" }),
  fields: { ProcessName: { type: "string" }, Description: { type: "string" }, UserId: { type: "string" } },
};

type AddRolesToProcessRequest = { RoleIds: (string | null)[] | null };

const addRolesToProcessRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.AddRolesToProcessRequest",
  create: () => ({ RoleIds: [] }),
  fields: { RoleIds: { type: "string[]" } },
};

type AddRoutesToProcessRequest = { RouteIds: (string | null)[] | null };

const addRoutesToProcessRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.AddRoutesToProcessRequest",
  create: () => ({ RouteIds: [] }),
  fields: { RouteIds: { type: "string[]" } },
};

function bindBody<T>(req: Request, ms: EssModelState, spec: EssBodySpec): T | null {
  return bindEssJsonBody<T>(req.headers["content-type"], req.essRawBody, ms, "request", spec);
}

// A non-nullable `string` action parameter is implicitly [Required]: an empty or whitespace-only
// route value binds to null and fails validation before the action runs.
function bindRouteString(req: Request, ms: EssModelState, name: string) {
  const value = String(req.params[name] ?? "");
  if (isNullOrWhiteSpace(value)) {
    ms.add(name, `The ${name} field is required.`);
  }
  return value;
}

// [HttpGet("processes")]
export async function getProcesses(req: Request, res: Response) {
  const data = await reRoutingService.getProcessesAsync();
  const ordered = orderByCulture(data, (p) => p.ProcessName);
  essOk(res, toEssJson(ordered), "data retrieved.");
}

// [HttpGet("processes/{processId}")]
export async function getProcess(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  const data = await reRoutingService.getProcessAsync(processId);

  if (data === null || data.ID === null || data.ID === "") {
    return essFail(res, 404, "Process not found.");
  }

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpPost("processes")]
export async function createProcess(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<CreateProcessRequest>(req, ms, createProcessRequestSpec);
  ms.throwIfInvalid();

  if (request === null || isNullOrWhiteSpace(request.ProcessName)) {
    return essFail(res, 400, "ProcessName is required.");
  }

  if (isNullOrWhiteSpace(request.UserId)) {
    return essFail(res, 400, "UserId is required.");
  }

  const existing = await reRoutingService.getProcessesAsync();
  if (existing.some((p) => equalsOrdinalIgnoreCase(p.ProcessName, request.ProcessName))) {
    return essFail(res, 409, "Process Name already taken. Please choose another name.");
  }

  const processId = await reRoutingService.addProcessAsync(request.ProcessName, request.Description, request.UserId);
  essOk(res, processId, "Process created.");
}

// [HttpDelete("processes/{processId}")]
export async function deleteProcess(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  await reRoutingService.removeProcessAsync(processId);
  essOk(res, true, "Process deleted.");
}

// [HttpGet("processes/{processId}/roles")]
export async function getProcessRoles(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  const data = await reRoutingService.getRolesOfProcessAsync(processId);
  const ordered = orderByCulture(data, (r) => r.Description);
  essOk(res, toEssJson(ordered), "data retrieved.");
}

// [HttpGet("processes/{processId}/routes")]
export async function getProcessRoutes(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  const data = await reRoutingService.getRoutesOfProcessAsync(processId);
  const ordered = orderByCulture(data, (r) => r.Name);
  essOk(res, toEssJson(ordered), "data retrieved.");
}

// [HttpGet("roles")]
export async function getAllRoles(req: Request, res: Response) {
  const data = await reRoutingService.getAllRolesAsync();
  const ordered = orderByCulture(data, (r) => r.Description);
  essOk(res, toEssJson(ordered), "data retrieved.");
}

// [HttpGet("routes")]
export async function getAllRoutes(req: Request, res: Response) {
  const data = await reRoutingService.getAllRoutesAsync();
  const ordered = orderByCulture(data, (r) => r.Name);
  essOk(res, toEssJson(ordered), "data retrieved.");
}

// [HttpPost("processes/{processId}/roles")]
export async function addRoles(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  const request = bindBody<AddRolesToProcessRequest>(req, ms, addRolesToProcessRequestSpec);
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  if (request === null || request.RoleIds === null || request.RoleIds.length === 0) {
    return essFail(res, 400, "At least one RoleId is required.");
  }

  for (const roleId of request.RoleIds.filter((r) => !isNullOrWhiteSpace(r))) {
    await reRoutingService.addRoleToProcessAsync(processId, roleId as string);
  }

  essOk(res, true, "Roles added to process.");
}

// [HttpPost("processes/{processId}/routes")]
export async function addRoutes(req: Request, res: Response) {
  const ms = new EssModelState();
  const processId = bindRouteString(req, ms, "processId");
  const request = bindBody<AddRoutesToProcessRequest>(req, ms, addRoutesToProcessRequestSpec);
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processId)) {
    return essFail(res, 400, "processId is required.");
  }

  if (request === null || request.RouteIds === null || request.RouteIds.length === 0) {
    return essFail(res, 400, "At least one RouteId is required.");
  }

  for (const routeId of request.RouteIds.filter((r) => !isNullOrWhiteSpace(r))) {
    await reRoutingService.addRouteToProcessAsync(processId, routeId as string);
  }

  essOk(res, true, "Routes added to process.");
}

// [HttpDelete("roles/{processRoleId}")]
export async function deleteRole(req: Request, res: Response) {
  const ms = new EssModelState();
  const processRoleId = bindRouteString(req, ms, "processRoleId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processRoleId)) {
    return essFail(res, 400, "processRoleId is required.");
  }

  await reRoutingService.removeRoleAsync(processRoleId);
  essOk(res, true, "Role removed from process.");
}

// [HttpDelete("routes/{processRouteId}")]
export async function deleteRoute(req: Request, res: Response) {
  const ms = new EssModelState();
  const processRouteId = bindRouteString(req, ms, "processRouteId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(processRouteId)) {
    return essFail(res, 400, "processRouteId is required.");
  }

  await reRoutingService.removeRouteAsync(processRouteId);
  essOk(res, true, "Route removed from process.");
}

// [HttpGet("processes-by-employee/{employeeId}")]
export async function getProcessesByEmployee(req: Request, res: Response) {
  const ms = new EssModelState();
  const employeeId = bindRouteString(req, ms, "employeeId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(employeeId)) {
    return essFail(res, 400, "employeeId is required.");
  }

  const data = await reRoutingService.getProcessesByEmployeeAsync(employeeId);
  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("tasks")]
export async function getTasks(req: Request, res: Response) {
  const ms = new EssModelState();
  const processGroup = ms.bind(() => queryString(req, "processGroup"));
  const currentApproverId = ms.bind(() => queryString(req, "currentApproverId"));
  const applicantId = ms.bind(() => queryString(req, "applicantId"));
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(currentApproverId)) {
    return essFail(res, 400, "currentApproverId is required.");
  }

  const data = await reRoutingService.getTasksAsync(processGroup ?? "", currentApproverId as string, applicantId ?? "");

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("tasks/{taskId}")]
export async function getTask(req: Request, res: Response) {
  const ms = new EssModelState();
  const taskId = bindRouteString(req, ms, "taskId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(taskId)) {
    return essFail(res, 400, "taskId is required.");
  }

  const data = await reRoutingService.getTaskAsync(taskId);

  if (data === null || data.ID === null || data.ID === "") {
    return essFail(res, 404, "Task not found.");
  }

  essOk(res, toEssJson(data), "data retrieved.");
}
