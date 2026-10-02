import { Request, Response } from "express";
import * as reRoutingService from "../../services/routingManagement/reRoutingService.js";
import * as routingManagementService from "../../services/routingManagement/routingManagementService.js";
import { EMPTY_GUID } from "../../utils/essDotnet.js";
import { toEssJson } from "../../utils/essFormat.js";
import { queryGuid, queryString } from "../../utils/essRequest.js";
import { essFail, essOk } from "../../utils/essResponse.js";
import { bindEssJsonBody, EssBodySpec, EssModelState } from "../../utils/essValidation.js";

// Port of ESS_Backend Controllers/RoutingManagement/ReAssignTaskController.cs
// ([Route("v{version:apiVersion}/reassigntask")]). [RequirePermission] is not ported.

type TaskReAssignRequest = { ActionerId: string; TaskIds: string[] | null; ReassignTo: string; Comment: string };

const taskReAssignRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.TaskReAssignRequest",
  create: () => ({ ActionerId: EMPTY_GUID, TaskIds: [], ReassignTo: EMPTY_GUID, Comment: "" }),
  fields: {
    ActionerId: { type: "guid" },
    TaskIds: { type: "guid[]" },
    ReassignTo: { type: "guid" },
    Comment: { type: "string" },
  },
};

// [HttpGet("processes")]
// Process groups ("Modules") available to the given admin for re-assignment, used to populate the
// optional legacy "Module" filter on the search screen.
export async function getProcessGroups(req: Request, res: Response) {
  const ms = new EssModelState();
  const employeeId = ms.bind(() => queryGuid(req, "employeeId"));
  ms.throwIfInvalid();

  const empId = employeeId === undefined || employeeId === EMPTY_GUID ? "" : employeeId;

  const data =
    empId === ""
      ? await reRoutingService.getProcessesAsync()
      : await reRoutingService.getProcessesByEmployeeAsync(empId);

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("search")]
export async function search(req: Request, res: Response) {
  const ms = new EssModelState();
  const currentApproverId = ms.bind(() => queryGuid(req, "currentApproverId"));
  const applicantId = ms.bind(() => queryGuid(req, "applicantId"));
  const applicationId = ms.bind(() => queryGuid(req, "applicationId"));
  const processGroup = ms.bind(() => queryString(req, "processGroup"));
  ms.throwIfInvalid();

  if (currentApproverId === undefined || currentApproverId === EMPTY_GUID) {
    return essFail(res, 400, "currentApproverId is required.");
  }

  const applicant = applicantId === undefined || applicantId === EMPTY_GUID ? "" : applicantId;
  const application = applicationId === undefined || applicationId === EMPTY_GUID ? "" : applicationId;

  const data = await reRoutingService.searchReAssignTasksAsync(processGroup ?? "", currentApproverId, applicant, application);

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpPost("reassign")]
export async function reAssign(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindEssJsonBody<TaskReAssignRequest>(req.headers["content-type"], req.essRawBody, ms, "request", taskReAssignRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (request.ActionerId === EMPTY_GUID) {
    return essFail(res, 400, "ActionerId is required.");
  }

  if (request.ReassignTo === EMPTY_GUID) {
    return essFail(res, 400, "ReassignTo is required.");
  }

  if (request.TaskIds === null || request.TaskIds.length === 0) {
    return essFail(res, 400, "At least one TaskId is required.");
  }

  let reassigned = 0;
  for (const taskId of request.TaskIds) {
    if (taskId === EMPTY_GUID) {
      continue;
    }

    const ok = await routingManagementService.taskReAssignAsync(request.ActionerId, taskId, request.ReassignTo, request.Comment);

    if (ok) {
      reassigned++;
    }
  }

  essOk(res, reassigned, `${reassigned} task(s) re-assigned.`);
}
