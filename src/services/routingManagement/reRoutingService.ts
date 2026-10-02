import * as model from "../../models/routingManagement/reRouting.js";
import { getNetString, getNetStringSafe, SqlRow } from "../../models/essSql.js";
import { equalsOrdinalIgnoreCase, isNullOrWhiteSpace } from "../../utils/essDotnet.js";

// Port of ESS_Backend Services/RoutingManagement/ReRoutingService.cs (legacy ESS.ReRouting.Service).
// The [General].* stored procedures live in the main ESS database (RbacDb / TNBESSDB).

// Models/RoutingManagement/ReRoutingModels.cs; properties not set by a mapping stay null.
export type ProcessGroup = {
  ID: string | null;
  ProcessName: string | null;
  ProcessDescription: string | null;
  LastModifiedDate: string | null;
  Roles: ProcessRole[] | null;
  Routes: ProcessRoute[] | null;
};

export type ProcessRole = {
  ID: string | null;
  Code: string | null;
  Description: string | null;
  ApplicationId: string | null;
  ProcessId: string | null;
};

export type ProcessRoute = {
  ID: string | null;
  Name: string | null;
  ProcessId: string | null;
};

const DISPLAY_TEXTS = Array.from({ length: 20 }, (_, index) => `DisplayText${index + 1}`);

export type ReRoutingTask = {
  ID: string | null;
  ReferenceNo: string | null;
  Applicant: string | null;
  CurrentApprover: string | null;
  ActivityName: string | null;
  Status: string | null;
  SourceID: string | null;
  ApplicationId: string | null;
  ApplicationName: string | null;
  CreateDate: string | null;
  ManagerId: string | null;
  ManagerCode: string | null;
  ManagerName: string | null;
} & Record<string, string | null>;

// Dtos/RoutingManagement/ReAssignTaskDto.cs
export type ReAssignTaskDto = {
  ID: string | null;
  SourceID: string | null;
  ApplicationID: string | null;
  ApplicationName: string | null;
  ApplicationRefNo: string | null;
  ApprovalTitle: string | null;
  ApplicantID: string | null;
  ApplicantCode: string | null;
  ApplicantName: string | null;
  ManagerID: string | null;
  ManagerCode: string | null;
  ManagerName: string | null;
  ApproverID: string | null;
  CurrentApproverCode: string | null;
  CurrentApproverName: string | null;
  Status: string | null;
  CreatedDate: string | null;
  FormLink: string | null;
};

function processGroup(values: Partial<ProcessGroup>): ProcessGroup {
  return {
    ID: values.ID ?? null,
    ProcessName: values.ProcessName ?? null,
    ProcessDescription: values.ProcessDescription ?? null,
    LastModifiedDate: values.LastModifiedDate ?? null,
    Roles: null,
    Routes: null,
  };
}

function processRole(values: Partial<ProcessRole>): ProcessRole {
  return {
    ID: values.ID ?? null,
    Code: values.Code ?? null,
    Description: values.Description ?? null,
    ApplicationId: values.ApplicationId ?? null,
    ProcessId: values.ProcessId ?? null,
  };
}

function processRoute(values: Partial<ProcessRoute>): ProcessRoute {
  return { ID: values.ID ?? null, Name: values.Name ?? null, ProcessId: values.ProcessId ?? null };
}

const ReRoutingTaskKeys = [
  "ID",
  "ReferenceNo",
  "Applicant",
  "CurrentApprover",
  "ActivityName",
  "Status",
  ...DISPLAY_TEXTS,
  "SourceID",
  "ApplicationId",
  "ApplicationName",
  "CreateDate",
  "ManagerId",
  "ManagerCode",
  "ManagerName",
];

function reRoutingTask(values: Record<string, string>): ReRoutingTask {
  return Object.fromEntries(ReRoutingTaskKeys.map((key) => [key, values[key] ?? null])) as ReRoutingTask;
}

const GetString = getNetString;

export async function getProcessesAsync(): Promise<ProcessGroup[]> {
  const rows = await model.queryEssProc("[General].[Process_GetAllProcesses]", []);
  return rows.map((row) => {
    const ID = GetString(row, "ID");
    const LastModifiedDate = GetString(row, "ModifiedDate");
    const ProcessDescription = GetString(row, "Description");
    const ProcessName = GetString(row, "ProcessName");
    return processGroup({ ID, LastModifiedDate, ProcessDescription, ProcessName });
  });
}

export async function getProcessAsync(processId: string): Promise<ProcessGroup | null> {
  const list = await model.queryEssProc("[General].[Process_GetProcess]", [["ProcessId", processId]]);
  const mapped = list.map((row) => {
    const ID = GetString(row, "ID");
    const LastModifiedDate = GetString(row, "ModifiedDate");
    const ProcessDescription = GetString(row, "Description");
    const ProcessName = GetString(row, "ProcessName");
    return processGroup({ ID, LastModifiedDate, ProcessDescription, ProcessName });
  });

  return mapped[0] ?? null;
}

export async function getProcessesByEmployeeAsync(employeeId: string): Promise<ProcessGroup[]> {
  const rows = await model.queryEssProc("[General].[Process_GetProcessesByEmployee]", [["EmployeeID", employeeId]]);
  return rows.map((row) => {
    const ID = GetString(row, "ID");
    const ProcessName = GetString(row, "ProcessName");
    return processGroup({ ID, ProcessName });
  });
}

export function addProcessAsync(processName: string, description: string, userId: string) {
  return model.execProcessCreate(processName, description, userId);
}

export function removeProcessAsync(processId: string) {
  return model.executeEssProc("[General].[Process_Delete]", [["ProcessId", processId]]);
}

export async function getRolesOfProcessAsync(processId: string): Promise<ProcessRole[]> {
  const rows = await model.queryEssProc("[General].[Process_GetRolesInProcess]", [["ProcessId", processId]]);
  return rows.map((row) => {
    const ID = GetString(row, "ID");
    const Description = GetString(row, "RoleDesc");
    return processRole({ ID, Description, ProcessId: processId });
  });
}

export async function getRoutesOfProcessAsync(processId: string): Promise<ProcessRoute[]> {
  const rows = await model.queryEssProc("[General].[Process_GetRoutesInProcess]", [["ProcessId", processId]]);
  return rows.map((row) => {
    const ID = GetString(row, "ID");
    const Name = GetString(row, "RoutingName");
    return processRoute({ ID, Name, ProcessId: processId });
  });
}

export async function getAllRolesAsync(): Promise<ProcessRole[]> {
  const rows = await model.queryEssProc("[General].[GetAllRole]", []);
  return rows.map((row) => {
    const Code = GetString(row, "RoleCode");
    const Description = GetString(row, "RoleDesc");
    const ID = GetString(row, "ID");
    const ApplicationId = GetString(row, "ApplicationID");
    return processRole({ ID, Code, Description, ApplicationId });
  });
}

export async function getAllRoutesAsync(): Promise<ProcessRoute[]> {
  const rows = await model.queryEssProc("[General].[GetRoutings]", []);
  return rows.map((row) => {
    const ID = GetString(row, "ID");
    const Name = GetString(row, "RoutingName");
    return processRoute({ ID, Name });
  });
}

export function addRoleToProcessAsync(processId: string, roleId: string) {
  return model.executeEssProc(
    "[General].[Process_AddRole]",
    [
      ["ProcessID", processId],
      ["RoleID", roleId],
    ],
  );
}

export function addRouteToProcessAsync(processId: string, routeId: string) {
  return model.executeEssProc(
    "[General].[Process_AddRoute]",
    [
      ["ProcessID", processId],
      ["RouteID", routeId],
    ],
  );
}

export function removeRoleAsync(processRoleId: string) {
  return model.executeEssProc("General.Process_DeleteRole", [["ProcessRoleId", processRoleId]]);
}

export function removeRouteAsync(routeId: string) {
  return model.executeEssProc("[General].[Process_DeleteRoute]", [["ID", routeId]]);
}

export async function getTasksAsync(processGroup: string, currentApproverId: string, applicantId: string): Promise<ReRoutingTask[]> {
  const rows = await model.queryEssProc(
    "[General].[ReAssign_GetTasks]",
    [
      ["ProcessId", processGroup],
      ["CurrentApproverId", currentApproverId],
      ["ApplicantId", applicantId],
    ],
  );
  return rows.map((row) => {
    const values: Record<string, string> = {};
    values.ID = GetString(row, "ID");
    values.ReferenceNo = GetString(row, "ApplicationRefNo");
    values.Applicant = GetString(row, "ApplicantCode") + " - " + GetString(row, "ApplicantName");
    values.CurrentApprover = GetString(row, "ApproverCode") + " - " + GetString(row, "ApproverName");
    values.ActivityName = GetString(row, "ApprovalTitle");
    values.Status = GetString(row, "CurrentStatus");
    for (const name of DISPLAY_TEXTS) values[name] = GetString(row, name);
    values.SourceID = GetString(row, "SourceID");
    values.ApplicationId = GetString(row, "ApplicationID");
    values.ApplicationName = GetString(row, "ApplicationName");
    values.CreateDate = GetString(row, "CreatedDate");
    values.ManagerId = GetString(row, "ManagerId");
    values.ManagerCode = GetString(row, "ManagerCode");
    values.ManagerName = GetString(row, "ManagerName");
    return reRoutingTask(values);
  });
}

export async function getTaskAsync(taskId: string): Promise<ReRoutingTask | null> {
  const list = await model.queryEssProc("[General].[Task_GetTaskById]", [["TaskID", taskId]]);
  const mapped = list.map((row: SqlRow) => {
    const values: Record<string, string> = {};
    values.ID = GetString(row, "ID");
    values.ReferenceNo = GetString(row, "ApplicationRefNo");
    for (const name of DISPLAY_TEXTS) values[name] = GetString(row, name);
    values.SourceID = GetString(row, "SourceID");
    values.ApplicationId = GetString(row, "ApplicationID");
    return reRoutingTask(values);
  });

  return mapped[0] ?? null;
}

// Searches pending approval tasks for the Task Re-Assignment screen via [General].[ReAssign_GetTasks],
// returning resolved applicant / manager / approver names (legacy parity). processGroup is the
// optional legacy "Module" filter (empty means all process groups). applicationId is an optional
// client-side filter (the proc itself filters by process group, approver and applicant only).
export async function searchReAssignTasksAsync(
  processGroup: string,
  currentApproverId: string,
  applicantId: string,
  applicationId: string,
): Promise<ReAssignTaskDto[]> {
  // Legacy ReAssignTask exposed an optional Process Group ("Module") filter;
  // an empty @ProcessId means "all process groups" (ESS convention).
  const rows = await model.queryEssProc(
    "[General].[ReAssign_GetTasks]",
    [
      ["ProcessId", processGroup ?? ""],
      ["CurrentApproverId", currentApproverId ?? ""],
      ["ApplicantId", applicantId ?? ""],
    ],
  );
  let tasks = rows.map(
    (row): ReAssignTaskDto => ({
      ID: GetString(row, "ID"),
      SourceID: GetString(row, "SourceID"),
      ApplicationID: GetString(row, "ApplicationID"),
      ApplicationName: GetString(row, "ApplicationName"),
      ApplicationRefNo: GetString(row, "ApplicationRefNo"),
      ApprovalTitle: GetString(row, "ApprovalTitle"),
      ApplicantID: getNetStringSafe(row, "ApplicantID"),
      ApplicantCode: GetString(row, "ApplicantCode"),
      ApplicantName: GetString(row, "ApplicantName"),
      ManagerID: getNetStringSafe(row, "ManagerId"),
      ManagerCode: GetString(row, "ManagerCode"),
      ManagerName: GetString(row, "ManagerName"),
      ApproverID: getNetStringSafe(row, "ApproverID"),
      CurrentApproverCode: GetString(row, "ApproverCode"),
      CurrentApproverName: GetString(row, "ApproverName"),
      Status: GetString(row, "CurrentStatus"),
      CreatedDate: GetString(row, "CreatedDate"),
      FormLink: getNetStringSafe(row, "FormLink"),
    }),
  );

  if (!isNullOrWhiteSpace(applicationId)) {
    tasks = tasks.filter((t) => equalsOrdinalIgnoreCase(t.ApplicationID, applicationId));
  }

  return tasks;
}
