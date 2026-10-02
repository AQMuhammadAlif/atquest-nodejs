import { Request, Response } from "express";
import * as routingManagementService from "../../services/routingManagement/routingManagementService.js";
import { ApplicationInfo, APPLICATION_INFO_STRING_FIELDS, newApplicationInfo } from "../../models/routingManagement/routingManagement.js";
import { addDays, EMPTY_GUID, formatNetDate, isNullOrWhiteSpace, netToday } from "../../utils/essDotnet.js";
import { toEssJson } from "../../utils/essFormat.js";
import { queryDateTime, queryGuid, queryInt, queryString, resolvePaging, routeGuid } from "../../utils/essRequest.js";
import { essFail, essOk } from "../../utils/essResponse.js";
import { bindEssJsonBody, EssBodyField, EssBodySpec, EssModelState } from "../../utils/essValidation.js";

// Port of ESS_Backend Controllers/RoutingManagement/RoutingManagementController.cs
// ([Route("v{version:apiVersion}/routingmanagement")]). [RequirePermission] is not ported
// (atquest convention: /v1 requires authentication only).

// ---------------------------------------------------------------------------------------------
// [FromBody] models (Requests/RoutingManagement/RoutingManagementRequest.cs)
// ---------------------------------------------------------------------------------------------

export const applicationInfoSpec: EssBodySpec = {
  clrType: "ESS_Backend.Models.RoutingManagement.ApplicationInfo",
  create: () => newApplicationInfo() as unknown as Record<string, unknown>,
  fields: {
    ...Object.fromEntries(APPLICATION_INFO_STRING_FIELDS.map((name): [string, EssBodyField] => [name, { type: "string" }])),
    OptionalApproverID1: { type: "guid" },
    Repeat: { type: "int" },
    Remove: { type: "int" },
  },
};

type PerformRoutingActionRequest = {
  ActionerId: string;
  SystemId: string;
  ApplicationId: string;
  ApplicationTypeId: string;
  ApplicationSubtypeId: string;
  TaskId: string;
  SourceId: string;
  ApplicantId: string;
  ApproverId: string;
  ApproverAction: string;
  ActivityAction: string;
  RequestAction: number;
  RoutingRuleId: string;
  AppInfo: ApplicationInfo;
  OptionalApproverRequired: boolean;
  OptionalApproverId: string;
};

const performRoutingActionRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.PerformRoutingActionRequest",
  create: () => ({
    ActionerId: "",
    SystemId: EMPTY_GUID,
    ApplicationId: EMPTY_GUID,
    ApplicationTypeId: EMPTY_GUID,
    ApplicationSubtypeId: EMPTY_GUID,
    TaskId: EMPTY_GUID,
    SourceId: EMPTY_GUID,
    ApplicantId: EMPTY_GUID,
    ApproverId: EMPTY_GUID,
    ApproverAction: "",
    ActivityAction: "",
    RequestAction: 0,
    RoutingRuleId: EMPTY_GUID,
    AppInfo: newApplicationInfo(),
    OptionalApproverRequired: false,
    OptionalApproverId: EMPTY_GUID,
  }),
  fields: {
    ActionerId: { type: "string" },
    SystemId: { type: "guid" },
    ApplicationId: { type: "guid" },
    ApplicationTypeId: { type: "guid" },
    ApplicationSubtypeId: { type: "guid" },
    TaskId: { type: "guid" },
    SourceId: { type: "guid" },
    ApplicantId: { type: "guid" },
    ApproverId: { type: "guid" },
    ApproverAction: { type: "string" },
    ActivityAction: { type: "string" },
    RequestAction: { type: "int" },
    RoutingRuleId: { type: "guid" },
    AppInfo: { type: "object", spec: applicationInfoSpec },
    OptionalApproverRequired: { type: "bool" },
    OptionalApproverId: { type: "guid" },
  },
};

type GotoActivityRequest = Omit<PerformRoutingActionRequest, "RoutingRuleId" | "OptionalApproverRequired" | "OptionalApproverId"> & {
  CurrentRoutingRuleId: string;
  GotoRoutingRuleId: string;
  OptionalApproverIds: string;
};

const gotoActivityRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.GotoActivityRequest",
  create: () => ({
    ActionerId: "",
    SystemId: EMPTY_GUID,
    ApplicationId: EMPTY_GUID,
    ApplicationTypeId: EMPTY_GUID,
    ApplicationSubtypeId: EMPTY_GUID,
    TaskId: EMPTY_GUID,
    SourceId: EMPTY_GUID,
    ApplicantId: EMPTY_GUID,
    ApproverId: EMPTY_GUID,
    ApproverAction: "",
    ActivityAction: "",
    RequestAction: 0,
    CurrentRoutingRuleId: EMPTY_GUID,
    GotoRoutingRuleId: EMPTY_GUID,
    AppInfo: newApplicationInfo(),
    OptionalApproverIds: "",
  }),
  fields: {
    ActionerId: { type: "string" },
    SystemId: { type: "guid" },
    ApplicationId: { type: "guid" },
    ApplicationTypeId: { type: "guid" },
    ApplicationSubtypeId: { type: "guid" },
    TaskId: { type: "guid" },
    SourceId: { type: "guid" },
    ApplicantId: { type: "guid" },
    ApproverId: { type: "guid" },
    ApproverAction: { type: "string" },
    ActivityAction: { type: "string" },
    RequestAction: { type: "int" },
    CurrentRoutingRuleId: { type: "guid" },
    GotoRoutingRuleId: { type: "guid" },
    AppInfo: { type: "object", spec: applicationInfoSpec },
    OptionalApproverIds: { type: "string" },
  },
};

// WithdrawRoutingRequest and CancelRoutingRequest have the same shape.
type WithdrawOrCancelRequest = {
  ActionerId: string;
  SystemId: string;
  ApplicationId: string;
  ApplicationTypeId: string;
  ApplicationSubtypeId: string;
  SourceId: string;
  Comment: string;
};

function withdrawOrCancelSpec(clrType: string): EssBodySpec {
  return {
    clrType,
    create: () => ({
      ActionerId: "",
      SystemId: EMPTY_GUID,
      ApplicationId: EMPTY_GUID,
      ApplicationTypeId: EMPTY_GUID,
      ApplicationSubtypeId: EMPTY_GUID,
      SourceId: EMPTY_GUID,
      Comment: "",
    }),
    fields: {
      ActionerId: { type: "string" },
      SystemId: { type: "guid" },
      ApplicationId: { type: "guid" },
      ApplicationTypeId: { type: "guid" },
      ApplicationSubtypeId: { type: "guid" },
      SourceId: { type: "guid" },
      Comment: { type: "string" },
    },
  };
}

const withdrawRoutingRequestSpec = withdrawOrCancelSpec("ESS_Backend.Requests.RoutingManagement.WithdrawRoutingRequest");
const cancelRoutingRequestSpec = withdrawOrCancelSpec("ESS_Backend.Requests.RoutingManagement.CancelRoutingRequest");

type WorkflowHistoryRequest = {
  SourceId: string;
  ActivityAction: string;
  ActivityName: string;
  Comments: string;
  ActionerId: string;
};

const workflowHistoryRequestSpec: EssBodySpec = {
  clrType: "ESS_Backend.Requests.RoutingManagement.WorkflowHistoryRequest",
  create: () => ({ SourceId: EMPTY_GUID, ActivityAction: "", ActivityName: "", Comments: "", ActionerId: EMPTY_GUID }),
  fields: {
    SourceId: { type: "guid" },
    ActivityAction: { type: "string" },
    ActivityName: { type: "string" },
    Comments: { type: "string" },
    ActionerId: { type: "guid" },
  },
};

function bindBody<T>(req: Request, ms: EssModelState, spec: EssBodySpec): T | null {
  return bindEssJsonBody<T>(req.headers["content-type"], req.essRawBody, ms, "request", spec);
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

// [HttpPost("teststartrouting")]
export async function testStartRouting(req: Request, res: Response) {
  const today = netToday();
  const appInfo: ApplicationInfo = {
    ...newApplicationInfo(),
    ApplicantDisplayName: "EmployeeName",
    ApplicationURL: "10.9.0.130/en/LeaveApplication/InTray",
    ApproverDisplayName: "Approver",
    Comment: "Dummy comment",
    ReferenceNo: "LSP08-251015-0001",
    RequestorDisplayName: "Danny",
    DisplayText1: "10102099",
    DisplayText2: "58308791-89FB-45D1-8A9E-72E430F8E677",
    DisplayText3: "Danny",
    DisplayText4: "LV02",
    DisplayText5: "Special Leave",
    DisplayText6: "SP08",
    DisplayText7: "Paternity",
    DisplayText8: formatNetDate(addDays(today, -1), "dd-MM-yyyy"),
    DisplayText9: formatNetDate(addDays(today, 1), "dd-MM-yyyy"),
    DisplayText10: "3",
    DisplayText11: "58308791-89FB-45D1-8A9E-72E430F8E677",
    DisplayText12: formatNetDate(today, "yyyy-MM-dd"),
    DisplayText13: "DescriptionComment",
    DisplayText14: "Pending",
    DisplayText15: "Pe",
    DisplayText16: "",
    DisplayImage1: "",
    DisplayImage2: "",
    DisplayImage3: "",
    DisplayImage4: "",
    DisplayImage5: "",
    DisplayImage6: "",
  };

  const result = await routingManagementService.startRoutingAsync(
    "58308791-89FB-45D1-8A9E-72E430F8E677",
    "72a1888e-d4a5-4e8e-b6b9-2d45bbb4b9c2",
    "4f43091a-8d99-447f-a63b-eb2e701a5b1d",
    "475cbc47-7328-4c2c-b47a-7984a8b1593a",
    "1054e00c-f16a-4630-8aaa-8a217908dce8",
    "c69f618d-8314-44f1-96c5-d8161ab267e2",
    "58308791-89fb-45d1-8a9e-72e430f8e677",
    "58308791-89fb-45d1-8a9e-72e430f8e677",
    appInfo,
    "",
    EMPTY_GUID,
  );

  essOk(res, toEssJson(result), "StartRouting test completed.");
}

// [HttpGet("getintray")]
export async function getInTray(req: Request, res: Response) {
  const ms = new EssModelState();
  const employeeId = ms.bind(() => queryString(req, "employeeId"));
  const applicationId = ms.bind(() => queryString(req, "applicationId"));
  const page = ms.bind(() => queryInt(req, "page"));
  const pageSize = ms.bind(() => queryInt(req, "pageSize"));
  ms.throwIfInvalid();

  const paging = resolvePaging({ page, pageSize });

  const data = await routingManagementService.getInTrayAsync(
    employeeId ?? null,
    applicationId ?? null,
    paging.page,
    paging.pageSize,
  );
  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("getmyintraysummary")]
export async function getMyIntraySummary(req: Request, res: Response) {
  const ms = new EssModelState();
  const employeeId = ms.bind(() => queryGuid(req, "employeeId"));
  ms.throwIfInvalid();

  if (employeeId === undefined || employeeId === EMPTY_GUID) {
    return essFail(res, 400, "employeeId is required.");
  }

  const data = await routingManagementService.getMyIntraySummaryAsync(employeeId);
  essOk(res, data, "data retrieved.");
}

// [HttpGet("getmyapprovalhistory")]
export async function getMyApprovalHistory(req: Request, res: Response) {
  const ms = new EssModelState();
  const employeeId = ms.bind(() => queryGuid(req, "employeeId"));
  const applicationId = ms.bind(() => queryGuid(req, "applicationId"));
  const dateFrom = ms.bind(() => queryDateTime(req, "dateFrom"));
  const dateTo = ms.bind(() => queryDateTime(req, "dateTo"));
  const page = ms.bind(() => queryInt(req, "page"));
  const pageSize = ms.bind(() => queryInt(req, "pageSize"));
  ms.throwIfInvalid();

  if (employeeId === undefined || employeeId === EMPTY_GUID) {
    return essFail(res, 400, "employeeId is required.");
  }

  const hasDateFrom = dateFrom !== undefined;
  const hasDateTo = dateTo !== undefined;

  if (hasDateFrom !== hasDateTo) {
    return essFail(res, 400, "Both dateFrom and dateTo must be provided together.");
  }

  if (hasDateFrom && dateFrom.getTime() > (dateTo as Date).getTime()) {
    return essFail(res, 400, "dateFrom must be earlier than or equal to dateTo.");
  }

  if (hasDateFrom && (applicationId === undefined || applicationId === EMPTY_GUID)) {
    return essFail(res, 400, "applicationId is required when dateFrom and dateTo are provided.");
  }

  const paging = resolvePaging({ page, pageSize });

  let rows;

  if (applicationId !== undefined && applicationId !== EMPTY_GUID && hasDateFrom) {
    rows = await routingManagementService.getMyApprovalHistoryAsync(employeeId, applicationId, dateFrom, dateTo as Date);
  } else if (applicationId !== undefined && applicationId !== EMPTY_GUID) {
    rows = await routingManagementService.getMyApprovalHistoryAsync(employeeId, applicationId, null, null);
  } else {
    rows = await routingManagementService.getMyApprovalHistoryAsync(employeeId, null, null, null);
  }

  const totalCount = rows.length;
  const items = rows.slice((paging.page - 1) * paging.pageSize).slice(0, paging.pageSize);

  const result = {
    Items: items,
    Page: paging.page,
    PageSize: paging.pageSize,
    TotalCount: totalCount,
  };

  essOk(res, toEssJson(result), "data retrieved.");
}

// [HttpPost("perform-action")] (no CancellationToken parameter)
export async function performAction(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<PerformRoutingActionRequest>(req, ms, performRoutingActionRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (isNullOrWhiteSpace(request.ActionerId)) {
    return essFail(res, 400, "ActionerId is required.");
  }

  const result = await routingManagementService.updateRoutingAsync(
    request.ActionerId,
    request.SystemId,
    request.ApplicationId,
    request.ApplicationTypeId,
    request.ApplicationSubtypeId,
    request.TaskId,
    request.SourceId,
    request.ApplicantId,
    request.ApproverId,
    request.ApproverAction,
    request.ActivityAction,
    request.RequestAction,
    request.RoutingRuleId,
    request.AppInfo,
    request.OptionalApproverRequired,
    request.OptionalApproverId,
  );

  essOk(res, toEssJson(result), "Action processed.");
}

// [HttpPost("goto-activity")] (no CancellationToken parameter)
export async function gotoActivity(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<GotoActivityRequest>(req, ms, gotoActivityRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (isNullOrWhiteSpace(request.ActionerId)) {
    return essFail(res, 400, "ActionerId is required.");
  }

  const result = await routingManagementService.gotoActivityAsync(
    request.ActionerId,
    request.SystemId,
    request.ApplicationId,
    request.ApplicationTypeId,
    request.ApplicationSubtypeId,
    request.TaskId,
    request.SourceId,
    request.ApplicantId,
    request.ApproverId,
    request.ApproverAction,
    request.ActivityAction,
    request.RequestAction,
    request.CurrentRoutingRuleId,
    request.GotoRoutingRuleId,
    request.AppInfo,
    request.OptionalApproverIds,
  );

  essOk(res, toEssJson(result), "Activity routing processed.");
}

// [HttpPost("withdraw")]
export async function withdraw(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<WithdrawOrCancelRequest>(req, ms, withdrawRoutingRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (isNullOrWhiteSpace(request.ActionerId)) {
    return essFail(res, 400, "ActionerId is required.");
  }

  if (request.SourceId === EMPTY_GUID) {
    return essFail(res, 400, "SourceId is required.");
  }

  const result = await routingManagementService.withdrawRequestAsync(
    request.ActionerId,
    request.SystemId,
    request.ApplicationId,
    request.ApplicationTypeId,
    request.ApplicationSubtypeId,
    request.SourceId,
    request.Comment,
  );

  essOk(res, result, result ? "Request withdrawn." : "No current task to withdraw.");
}

// [HttpPost("cancel")]
export async function cancel(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<WithdrawOrCancelRequest>(req, ms, cancelRoutingRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (isNullOrWhiteSpace(request.ActionerId)) {
    return essFail(res, 400, "ActionerId is required.");
  }

  if (request.SourceId === EMPTY_GUID) {
    return essFail(res, 400, "SourceId is required.");
  }

  const result = await routingManagementService.cancelRequestAsync(
    request.ActionerId,
    request.SystemId,
    request.ApplicationId,
    request.ApplicationTypeId,
    request.ApplicationSubtypeId,
    request.SourceId,
    request.Comment,
  );

  essOk(res, result, result ? "Request cancelled." : "No current task to cancel.");
}

// [HttpGet("allow-actions")]
export async function getAllowActions(req: Request, res: Response) {
  const ms = new EssModelState();
  const sourceId = ms.bind(() => queryGuid(req, "sourceId"));
  const employeeId = ms.bind(() => queryGuid(req, "employeeId"));
  const module = ms.bind(() => queryString(req, "module"));
  ms.throwIfInvalid();

  if (sourceId === undefined || sourceId === EMPTY_GUID) {
    return essFail(res, 400, "sourceId is required.");
  }

  if (employeeId === undefined || employeeId === EMPTY_GUID) {
    return essFail(res, 400, "employeeId is required.");
  }

  const data = await routingManagementService.getUserAllowActionAsync(sourceId, employeeId, module ?? "");

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("task/{id}")]
export async function getTask(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = ms.bind(() => routeGuid(req, "id"));
  ms.throwIfInvalid();

  if (id === EMPTY_GUID) {
    return essFail(res, 400, "id is required.");
  }

  const data = await routingManagementService.getTaskDetailsByIDAsync(id as string);

  if (data === null) {
    return essFail(res, 404, "Task not found.");
  }

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("audit-log")]
export async function getAuditLog(req: Request, res: Response) {
  const ms = new EssModelState();
  const sourceId = ms.bind(() => queryGuid(req, "sourceId"));
  ms.throwIfInvalid();

  if (sourceId === undefined || sourceId === EMPTY_GUID) {
    return essFail(res, 400, "sourceId is required.");
  }

  const data = await routingManagementService.getAuditLogHistoryBySourceIDAsync(sourceId);
  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpPost("workflow-history")]
export async function insertWorkflowHistory(req: Request, res: Response) {
  const ms = new EssModelState();
  const request = bindBody<WorkflowHistoryRequest>(req, ms, workflowHistoryRequestSpec);
  ms.throwIfInvalid();

  if (request === null) {
    return essFail(res, 400, "Request body is required.");
  }

  if (request.SourceId === EMPTY_GUID) {
    return essFail(res, 400, "SourceId is required.");
  }

  const result = await routingManagementService.insertWorkflowHistoryAsync(
    request.SourceId,
    request.ActivityAction,
    request.ActivityName,
    request.Comments,
    request.ActionerId,
  );

  essOk(res, result, result ? "Workflow history inserted." : "Failed to insert workflow history.");
}

// [HttpPost("restartrouting")]
export async function restartRouting(req: Request, res: Response) {
  const ms = new EssModelState();
  const restartRoutingId = ms.bind(() => queryGuid(req, "restartRoutingId"));
  ms.throwIfInvalid();

  if (restartRoutingId === undefined || restartRoutingId === EMPTY_GUID) {
    return essFail(res, 400, "restartRoutingId is required.");
  }

  const result = await routingManagementService.restartRoutingAsync(restartRoutingId);
  const message = result.Result ? "Routing restarted." : isNullOrWhiteSpace(result.ErrMessage) ? "Routing restart failed." : result.ErrMessage;

  essOk(res, toEssJson(result), message);
}
