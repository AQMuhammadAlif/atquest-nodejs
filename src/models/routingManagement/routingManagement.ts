import { Prisma } from "../../generated/routing/index.js";
import { EMPTY_GUID, xmlParseFlat, xmlSerializeFlat, xmlToInt32, newGuid, netErrors } from "../../utils/essDotnet.js";
import { read, runSql, SqlRow } from "../essSql.js";
import { routingPrisma, sqlParam } from "../routingPrisma.js";

// SEPRoutingManagement access (Prisma) for RoutingManagementService (ESS_Backend). Types keep the C#
// class and property names (Models/RoutingManagement/RoutingManagementModels.cs); queries are the
// SQL that EF Core / SqlClient send for the C# code they replace.

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type RoutingTask = {
  ID: string;
  RoutingRuleID: string;
  SourceID: string;
  ApplicationID: string;
  ApplicantID: string | null;
  ApprovalTitle: string;
  ApplicationRefNo: string | null;
  DisplayText1: string | null;
  DisplayText2: string | null;
  DisplayText3: string | null;
  DisplayText4: string | null;
  DisplayText5: string | null;
  DisplayText6: string | null;
  DisplayText7: string | null;
  DisplayText8: string | null;
  DisplayText9: string | null;
  DisplayText10: string | null;
  DisplayText11: string | null;
  DisplayText12: string | null;
  DisplayText13: string | null;
  DisplayText14: string | null;
  DisplayText15: string | null;
  DisplayText16: string | null;
  DisplayText17: string | null;
  DisplayText18: string | null;
  DisplayText19: string | null;
  DisplayText20: string | null;
  ApprovalLevel: number;
  CurrentApproval: boolean;
  ApproverID: string;
  ApproverAction: string | null;
  Comment: string | null;
  SkipApproval: boolean | null;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

export type TaskHistory = {
  ID: string;
  SourceID: string;
  TaskID: string | null;
  ActivityName: string;
  ActivityAction: string;
  Comment: string | null;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

export type Routing = {
  ID: string;
  RoutingName: string;
  SystemID: string;
  ApplicationID: string;
  ApplicationTypeID: string;
  ApplicationSubTypeID: string;
  Active: boolean;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

export type RoutingRule = {
  ID: string;
  RoutingID: string;
  ApprovalTitle: string;
  ApprovalLevel: number;
  ApprovalRole: string;
  CurrentStatus: string | null;
  OptionalApproval: boolean;
  RequiredEveryOneAction: boolean;
  YesLabel: string;
  YesActionLogLabel: string;
  YesStatus: string | null;
  NoStatus: string | null;
  NoLabel: string;
  NoActionLogLabel: string;
  ReworkLabel: string | null;
  ReworkActionLogLabel: string | null;
  ReworkStatus: string | null;
  ChangeProcessAfter: number | null;
  ChangeProcessStatus: string | null;
  EndProcessAfter: number | null;
  EndProcessStatus: string | null;
  EscalateAfter: number | null;
  EscalateTo: string | null;
  SkipSameApprover: boolean;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

export type EmailTemplate = {
  ID: string;
  RoutingRuleID: string;
  SendEmail: boolean;
  NotificationType: string;
  IsHTMLBody: boolean;
  Subject: string;
  ContentTemplate: string;
  EmailTo: string;
  EmailCC: string | null;
  EmailBCC: string | null;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

// Remaining SEPRoutingManagementDbContext entities (Common.App/AppSubType/AppType/Sys, dbo.sysdiagrams,
// RM.AvailableAction/CustomApprover, views RM.GetEmailTemplate/GetRoutingList). RoutingManagementService
// does not use them in ESS; navigation properties are left out as for the types above.

export type App = {
  ID: string;
  SystemID: string;
  ApplicationName: string | null;
  Active: boolean | null;
  DisplayName: string | null;
  Intray: string | null;
  ReminderActive: boolean | null;
  CustomInTray: boolean | null;
  CustomInTraySource: string | null;
};

export type AppSubType = {
  ID: string;
  ApplicationTypeID: string;
  ApplicationSubTypeName: string;
  Active: boolean | null;
};

export type AppType = {
  ID: string;
  ApplicationID: string;
  ApplicationTypeName: string | null;
  Active: boolean | null;
};

export type Sy = {
  ID: string;
  SystemName: string | null;
  Active: boolean | null;
};

export type SysDiagram = {
  Name: string;
  PrincipalId: number;
  DiagramId: number;
  Version: number | null;
  Definition: Buffer | null;
};

export type AvailableAction = {
  ActionName: string;
  ActionType: string | null;
};

export type CustomApprover = {
  ID: string;
  RoutingRuleID: string;
  ApproverID: string;
  CreatedDate: Date | null;
  ModifiedDate: Date | null;
  CreatedBy: string | null;
  ModifiedBy: string | null;
};

export type GetEmailTemplate = {
  RoutingID: string;
  RoutingName: string;
  RoutingRuleID: string;
  ApprovalTitle: string;
  EmailTemplateID: string;
  SendEmail: boolean;
  NotificationType: string;
  IsHTMLBody: boolean;
  Subject: string;
  ContentTemplate: string;
  EmailTo: string;
  EmailCC: string | null;
  EmailBCC: string | null;
  ModifiedBy: string | null;
  ModifiedDate: Date | null;
  CreatedDate: Date | null;
  CreatedBy: string | null;
  ApplicationName: string | null;
  ApplicationSubTypeName: string;
  SystemName: string | null;
  ApplicationTypeName: string | null;
};

export type GetRoutingList = {
  RoutingID: string;
  RoutingName: string;
  SystemName: string | null;
  ApplicationName: string | null;
  ApplicationTypeName: string | null;
  ApplicationSubTypeName: string;
  Active: boolean;
};

export type GetMyIntray = {
  ID: string;
  RoutingRuleID: string;
  SourceID: string;
  ApproverID: string;
  ApproverName: string | null;
  ApproverCode: string | null;
  DisplayText1: string | null;
  DisplayText2: string | null;
  DisplayText3: string | null;
  DisplayText4: string | null;
  DisplayText5: string | null;
  DisplayText6: string | null;
  DisplayText7: string | null;
  DisplayText8: string | null;
  DisplayText9: string | null;
  DisplayText10: string | null;
  ApplicationRefNo: string | null;
  ApplicationID: string;
  ApplicantID: string;
  ApplicantCode: string | null;
  ApplicantName: string | null;
  CompanyCode: string | null;
  CompanyName: string | null;
  AreaCode: string | null;
  AreaName: string | null;
  SubAreaCode: string | null;
  SubAreaName: string | null;
  CreatedDate: Date | null;
  YesAction: string;
  NoAction: string | null;
  ReworkAction: string | null;
  DisplayText11: string | null;
  DisplayText12: string | null;
  DisplayText13: string | null;
  DisplayText14: string | null;
  DisplayText15: string | null;
  DisplayText16: string | null;
  DisplayText17: string | null;
  DisplayText18: string | null;
  DisplayText19: string | null;
  DisplayText20: string | null;
  PayScaleGroup: string | null;
  PhoneNumber: string | null;
};

export type GetMyApprovalHistory = {
  ID: string;
  RoutingRuleID: string;
  SourceID: string;
  ApproverID: string;
  ApproverName: string | null;
  ApproverCode: string | null;
  DisplayText1: string | null;
  DisplayText2: string | null;
  DisplayText3: string | null;
  DisplayText4: string | null;
  DisplayText5: string | null;
  DisplayText6: string | null;
  DisplayText7: string | null;
  DisplayText8: string | null;
  DisplayText9: string | null;
  DisplayText10: string | null;
  ApplicationRefNo: string | null;
  ApplicationID: string;
  ApproverAction: string | null;
  ActionDate: Date | null;
  ApplicantID: string | null;
  ApplicantCode: string | null;
  ApplicantName: string | null;
  CompanyCode: string | null;
  CompanyName: string | null;
  AreaCode: string | null;
  AreaName: string | null;
  SubAreaCode: string | null;
  SubAreaName: string | null;
  LeaveStatus: string;
  YesStatus: string | null;
  NoStatus: string | null;
  DisplayText11: string | null;
  DisplayText12: string | null;
  DisplayText13: string | null;
  DisplayText14: string | null;
  DisplayText15: string | null;
  DisplayText16: string | null;
  DisplayText17: string | null;
  DisplayText18: string | null;
  DisplayText19: string | null;
  DisplayText20: string | null;
};

export type GetApprovalAuditLog = {
  ActionerID: string | null;
  EmployeeName: string | null;
  EmployeeCode: string | null;
  Comment: string;
  ActivityAction: string;
  ActivityName: string;
  CreatedDate: Date | null;
  SourceID: string;
  FormattedDate: string;
};

export type ApproverInfo = {
  ApproverID: string;
  ApproverLoginName: string;
  ApproverName: string;
  ApproverEmail: string;
};

export type AllowAction = {
  CanAgree: string;
  CanApprove: string;
  CanDecline: string;
  CanAcknowledge: string;
  CanSubmit: string;
  CanWithdraw: string;
  CanCancel: string;
  CanReceive: string;
  CanProcess: string;
  CanRecommend: string;
  CanEndorse: string;
  CanVerify: string;
  CanRework: string;
  CanProcessMemo: string;
  CanAgreeCancel: string;
};

// ApplicationInfo: the C# constructor sets every string to "", OptionalApproverID1 to
// Guid.Empty, Repeat to 0 and Remove to 1.
export type ApplicationInfo = {
  ReferenceNo: string;
  ApplicantDisplayName: string;
  RequestorDisplayName: string;
  ApplicationURL: string;
  ApproverDisplayName: string;
  Comment: string;
  DisplayText1: string;
  DisplayText2: string;
  DisplayText3: string;
  DisplayText4: string;
  DisplayText5: string;
  DisplayText6: string;
  DisplayText7: string;
  DisplayText8: string;
  DisplayText9: string;
  DisplayText10: string;
  DisplayText11: string;
  DisplayText12: string;
  DisplayText13: string;
  DisplayText14: string;
  DisplayText15: string;
  DisplayText16: string;
  DisplayText17: string;
  DisplayText18: string;
  DisplayText19: string;
  DisplayText20: string;
  DisplayImage1: string;
  DisplayImage2: string;
  DisplayImage3: string;
  DisplayImage4: string;
  DisplayImage5: string;
  DisplayImage6: string;
  OptionalApproverID1: string;
  Repeat: number;
  Remove: number;
};

export const APPLICATION_INFO_STRING_FIELDS = [
  "ReferenceNo",
  "ApplicantDisplayName",
  "RequestorDisplayName",
  "ApplicationURL",
  "ApproverDisplayName",
  "Comment",
  "DisplayText1",
  "DisplayText2",
  "DisplayText3",
  "DisplayText4",
  "DisplayText5",
  "DisplayText6",
  "DisplayText7",
  "DisplayText8",
  "DisplayText9",
  "DisplayText10",
  "DisplayText11",
  "DisplayText12",
  "DisplayText13",
  "DisplayText14",
  "DisplayText15",
  "DisplayText16",
  "DisplayText17",
  "DisplayText18",
  "DisplayText19",
  "DisplayText20",
  "DisplayImage1",
  "DisplayImage2",
  "DisplayImage3",
  "DisplayImage4",
  "DisplayImage5",
  "DisplayImage6",
] as const;

export function newApplicationInfo(): ApplicationInfo {
  const info = Object.fromEntries(APPLICATION_INFO_STRING_FIELDS.map((name) => [name, ""])) as Record<string, unknown>;
  info.OptionalApproverID1 = EMPTY_GUID;
  info.Repeat = 0;
  info.Remove = 1;
  return info as ApplicationInfo;
}

// XmlSerializer.Serialize(ApplicationInfo) as InsertRoutingRestartAsync writes it.
export function serializeApplicationInfo(info: ApplicationInfo): string {
  return xmlSerializeFlat("ApplicationInfo", [
    ...APPLICATION_INFO_STRING_FIELDS.map((name): [string, string | null] => [name, info[name] ?? null]),
    ["OptionalApproverID1", info.OptionalApproverID1],
    ["Repeat", info.Repeat],
    ["Remove", info.Remove],
  ]);
}

// ApplicationInfo.Deserialize(AppInfoXml)
export function deserializeApplicationInfo(xml: string): ApplicationInfo {
  const values = xmlParseFlat(xml, "ApplicationInfo");
  const info = newApplicationInfo() as Record<string, unknown>;
  for (const name of APPLICATION_INFO_STRING_FIELDS) {
    if (values.has(name)) info[name] = values.get(name);
  }
  if (values.has("OptionalApproverID1")) info.OptionalApproverID1 = newGuid(values.get("OptionalApproverID1"));
  if (values.has("Repeat")) info.Repeat = xmlToInt32(values.get("Repeat") ?? "");
  if (values.has("Remove")) info.Remove = xmlToInt32(values.get("Remove") ?? "");
  return info as ApplicationInfo;
}

// RM.RoutingRestart_Init row, read the way CreateRoutingParameters reads the SqlDataReader.
export type RoutingParameter = {
  RoutingType: string;
  ActionerID: string | null;
  SystemID: string | null;
  ApplicationID: string | null;
  ApplicationTypeID: string | null;
  ApplicationSubtypeID: string | null;
  TaskID: string | null;
  SourceID: string | null;
  ApplicantID: string | null;
  SubmitterID: string | null;
  ApproverID: string | null;
  ApproverAction: string;
  ActivityAction: string;
  RequestAction: number;
  RoutingRuleID: string | null;
  AppInfo: ApplicationInfo | null;
  ActivityName: string;
  CustomApproverID: string | null;
  OptionalApproverRequired: boolean | null;
  OptionalApproverID: string | null;
};

// ---------------------------------------------------------------------------------------------
// Row mapping (EF materialization; see essSql.read)
// ---------------------------------------------------------------------------------------------

const DISPLAY_TEXTS = Array.from({ length: 20 }, (_, index) => `DisplayText${index + 1}`);

const TASK_COLUMNS = [
  "ID",
  "RoutingRuleID",
  "SourceID",
  "ApplicationID",
  "ApplicantID",
  "ApprovalTitle",
  "ApplicationRefNo",
  ...DISPLAY_TEXTS,
  "ApprovalLevel",
  "CurrentApproval",
  "ApproverID",
  "ApproverAction",
  "Comment",
  "SkipApproval",
  "CreatedDate",
  "ModifiedDate",
  "CreatedBy",
  "ModifiedBy",
];

function mapTask(row: SqlRow): RoutingTask {
  const task: Record<string, unknown> = {
    ID: read.guid(row, "ID"),
    RoutingRuleID: read.guid(row, "RoutingRuleID"),
    SourceID: read.guid(row, "SourceID"),
    ApplicationID: read.guid(row, "ApplicationID"),
    ApplicantID: read.guidOrNull(row, "ApplicantID"),
    ApprovalTitle: read.string(row, "ApprovalTitle"),
    ApplicationRefNo: read.stringOrNull(row, "ApplicationRefNo"),
  };
  for (const name of DISPLAY_TEXTS) task[name] = read.stringOrNull(row, name);
  Object.assign(task, {
    ApprovalLevel: read.int(row, "ApprovalLevel"),
    CurrentApproval: read.bool(row, "CurrentApproval"),
    ApproverID: read.guid(row, "ApproverID"),
    ApproverAction: read.stringOrNull(row, "ApproverAction"),
    Comment: read.stringOrNull(row, "Comment"),
    SkipApproval: read.boolOrNull(row, "SkipApproval"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
  });
  return task as RoutingTask;
}

const TASK_HISTORY_COLUMNS = ["ID", "SourceID", "TaskID", "ActivityName", "ActivityAction", "Comment", "CreatedDate", "ModifiedDate", "CreatedBy", "ModifiedBy"];

function mapTaskHistory(row: SqlRow): TaskHistory {
  return {
    ID: read.guid(row, "ID"),
    SourceID: read.guid(row, "SourceID"),
    TaskID: read.guidOrNull(row, "TaskID"),
    ActivityName: read.string(row, "ActivityName"),
    ActivityAction: read.string(row, "ActivityAction"),
    Comment: read.stringOrNull(row, "Comment"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
  };
}

const ROUTING_COLUMNS = ["ID", "RoutingName", "SystemID", "ApplicationID", "ApplicationTypeID", "ApplicationSubTypeID", "Active", "CreatedDate", "ModifiedDate", "CreatedBy", "ModifiedBy"];

function mapRouting(row: SqlRow): Routing {
  return {
    ID: read.guid(row, "ID"),
    RoutingName: read.string(row, "RoutingName"),
    SystemID: read.guid(row, "SystemID"),
    ApplicationID: read.guid(row, "ApplicationID"),
    ApplicationTypeID: read.guid(row, "ApplicationTypeID"),
    ApplicationSubTypeID: read.guid(row, "ApplicationSubTypeID"),
    Active: read.bool(row, "Active"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
  };
}

const ROUTING_RULE_COLUMNS = [
  "ID",
  "RoutingID",
  "ApprovalTitle",
  "ApprovalLevel",
  "ApprovalRole",
  "CurrentStatus",
  "OptionalApproval",
  "RequiredEveryOneAction",
  "YesLabel",
  "YesActionLogLabel",
  "YesStatus",
  "NoStatus",
  "NoLabel",
  "NoActionLogLabel",
  "ReworkLabel",
  "ReworkActionLogLabel",
  "ReworkStatus",
  "ChangeProcessAfter",
  "ChangeProcessStatus",
  "EndProcessAfter",
  "EndProcessStatus",
  "EscalateAfter",
  "EscalateTo",
  "SkipSameApprover",
  "CreatedDate",
  "ModifiedDate",
  "CreatedBy",
  "ModifiedBy",
];

function mapRoutingRule(row: SqlRow): RoutingRule {
  return {
    ID: read.guid(row, "ID"),
    RoutingID: read.guid(row, "RoutingID"),
    ApprovalTitle: read.string(row, "ApprovalTitle"),
    ApprovalLevel: read.int(row, "ApprovalLevel"),
    ApprovalRole: read.string(row, "ApprovalRole"),
    CurrentStatus: read.stringOrNull(row, "CurrentStatus"),
    OptionalApproval: read.bool(row, "OptionalApproval"),
    RequiredEveryOneAction: read.bool(row, "RequiredEveryOneAction"),
    YesLabel: read.string(row, "YesLabel"),
    YesActionLogLabel: read.string(row, "YesActionLogLabel"),
    YesStatus: read.stringOrNull(row, "YesStatus"),
    NoStatus: read.stringOrNull(row, "NoStatus"),
    NoLabel: read.string(row, "NoLabel"),
    NoActionLogLabel: read.string(row, "NoActionLogLabel"),
    ReworkLabel: read.stringOrNull(row, "ReworkLabel"),
    ReworkActionLogLabel: read.stringOrNull(row, "ReworkActionLogLabel"),
    ReworkStatus: read.stringOrNull(row, "ReworkStatus"),
    ChangeProcessAfter: read.intOrNull(row, "ChangeProcessAfter"),
    ChangeProcessStatus: read.stringOrNull(row, "ChangeProcessStatus"),
    EndProcessAfter: read.intOrNull(row, "EndProcessAfter"),
    EndProcessStatus: read.stringOrNull(row, "EndProcessStatus"),
    EscalateAfter: read.intOrNull(row, "EscalateAfter"),
    EscalateTo: read.stringOrNull(row, "EscalateTo"),
    SkipSameApprover: read.bool(row, "SkipSameApprover"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
  };
}

const EMAIL_TEMPLATE_COLUMNS = [
  "ID",
  "RoutingRuleID",
  "SendEmail",
  "NotificationType",
  "IsHTMLBody",
  "Subject",
  "ContentTemplate",
  "EmailTo",
  "EmailCC",
  "EmailBCC",
  "CreatedDate",
  "ModifiedDate",
  "CreatedBy",
  "ModifiedBy",
];

function mapEmailTemplate(row: SqlRow): EmailTemplate {
  return {
    ID: read.guid(row, "ID"),
    RoutingRuleID: read.guid(row, "RoutingRuleID"),
    SendEmail: read.bool(row, "SendEmail"),
    NotificationType: read.string(row, "NotificationType"),
    IsHTMLBody: read.bool(row, "IsHTMLBody"),
    Subject: read.string(row, "Subject"),
    ContentTemplate: read.string(row, "ContentTemplate"),
    EmailTo: read.string(row, "EmailTo"),
    EmailCC: read.stringOrNull(row, "EmailCC"),
    EmailBCC: read.stringOrNull(row, "EmailBCC"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
  };
}

// Column lists and row mappers for the entities RoutingManagementService does not use (EF column
// names: SysDiagram maps to the snake_case sysdiagrams columns).

export const APP_COLUMNS = ["ID", "SystemID", "ApplicationName", "Active", "DisplayName", "Intray", "ReminderActive", "CustomInTray", "CustomInTraySource"];

export function mapApp(row: SqlRow): App {
  return {
    ID: read.guid(row, "ID"),
    SystemID: read.guid(row, "SystemID"),
    ApplicationName: read.stringOrNull(row, "ApplicationName"),
    Active: read.boolOrNull(row, "Active"),
    DisplayName: read.stringOrNull(row, "DisplayName"),
    Intray: read.stringOrNull(row, "Intray"),
    ReminderActive: read.boolOrNull(row, "ReminderActive"),
    CustomInTray: read.boolOrNull(row, "CustomInTray"),
    CustomInTraySource: read.stringOrNull(row, "CustomInTraySource"),
  };
}

export const APP_SUB_TYPE_COLUMNS = ["ID", "ApplicationTypeID", "ApplicationSubTypeName", "Active"];

export function mapAppSubType(row: SqlRow): AppSubType {
  return {
    ID: read.guid(row, "ID"),
    ApplicationTypeID: read.guid(row, "ApplicationTypeID"),
    ApplicationSubTypeName: read.string(row, "ApplicationSubTypeName"),
    Active: read.boolOrNull(row, "Active"),
  };
}

export const APP_TYPE_COLUMNS = ["ID", "ApplicationID", "ApplicationTypeName", "Active"];

export function mapAppType(row: SqlRow): AppType {
  return {
    ID: read.guid(row, "ID"),
    ApplicationID: read.guid(row, "ApplicationID"),
    ApplicationTypeName: read.stringOrNull(row, "ApplicationTypeName"),
    Active: read.boolOrNull(row, "Active"),
  };
}

export const SY_COLUMNS = ["ID", "SystemName", "Active"];

export function mapSy(row: SqlRow): Sy {
  return {
    ID: read.guid(row, "ID"),
    SystemName: read.stringOrNull(row, "SystemName"),
    Active: read.boolOrNull(row, "Active"),
  };
}

export const SYS_DIAGRAM_COLUMNS = ["name", "principal_id", "diagram_id", "version", "definition"];

export function mapSysDiagram(row: SqlRow): SysDiagram {
  return {
    Name: read.string(row, "name"),
    PrincipalId: read.int(row, "principal_id"),
    DiagramId: read.int(row, "diagram_id"),
    Version: read.intOrNull(row, "version"),
    Definition: read.bytesOrNull(row, "definition"),
  };
}

export const AVAILABLE_ACTION_COLUMNS = ["ActionName", "ActionType"];

export function mapAvailableAction(row: SqlRow): AvailableAction {
  return {
    ActionName: read.string(row, "ActionName"),
    ActionType: read.stringOrNull(row, "ActionType"),
  };
}

export const CUSTOM_APPROVER_COLUMNS = ["ID", "RoutingRuleID", "ApproverID", "CreatedDate", "ModifiedDate", "CreatedBy", "ModifiedBy"];

export function mapCustomApprover(row: SqlRow): CustomApprover {
  return {
    ID: read.guid(row, "ID"),
    RoutingRuleID: read.guid(row, "RoutingRuleID"),
    ApproverID: read.guid(row, "ApproverID"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ModifiedBy: read.stringOrNull(row, "ModifiedBy"),
  };
}

export const GET_EMAIL_TEMPLATE_COLUMNS = [
  "RoutingID",
  "RoutingName",
  "RoutingRuleID",
  "ApprovalTitle",
  "EmailTemplateID",
  "SendEmail",
  "NotificationType",
  "IsHTMLBody",
  "Subject",
  "ContentTemplate",
  "EmailTo",
  "EmailCC",
  "EmailBCC",
  "ModifiedBy",
  "ModifiedDate",
  "CreatedDate",
  "CreatedBy",
  "ApplicationName",
  "ApplicationSubTypeName",
  "SystemName",
  "ApplicationTypeName",
];

export function mapGetEmailTemplate(row: SqlRow): GetEmailTemplate {
  return {
    RoutingID: read.guid(row, "RoutingID"),
    RoutingName: read.string(row, "RoutingName"),
    RoutingRuleID: read.guid(row, "RoutingRuleID"),
    ApprovalTitle: read.string(row, "ApprovalTitle"),
    EmailTemplateID: read.guid(row, "EmailTemplateID"),
    SendEmail: read.bool(row, "SendEmail"),
    NotificationType: read.string(row, "NotificationType"),
    IsHTMLBody: read.bool(row, "IsHTMLBody"),
    Subject: read.string(row, "Subject"),
    ContentTemplate: read.string(row, "ContentTemplate"),
    EmailTo: read.string(row, "EmailTo"),
    EmailCC: read.stringOrNull(row, "EmailCC"),
    EmailBCC: read.stringOrNull(row, "EmailBCC"),
    ModifiedBy: read.guidOrNull(row, "ModifiedBy"),
    ModifiedDate: read.dateOrNull(row, "ModifiedDate"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    CreatedBy: read.guidOrNull(row, "CreatedBy"),
    ApplicationName: read.stringOrNull(row, "ApplicationName"),
    ApplicationSubTypeName: read.string(row, "ApplicationSubTypeName"),
    SystemName: read.stringOrNull(row, "SystemName"),
    ApplicationTypeName: read.stringOrNull(row, "ApplicationTypeName"),
  };
}

export const GET_ROUTING_LIST_COLUMNS = ["RoutingID", "RoutingName", "SystemName", "ApplicationName", "ApplicationTypeName", "ApplicationSubTypeName", "Active"];

export function mapGetRoutingList(row: SqlRow): GetRoutingList {
  return {
    RoutingID: read.guid(row, "RoutingID"),
    RoutingName: read.string(row, "RoutingName"),
    SystemName: read.stringOrNull(row, "SystemName"),
    ApplicationName: read.stringOrNull(row, "ApplicationName"),
    ApplicationTypeName: read.stringOrNull(row, "ApplicationTypeName"),
    ApplicationSubTypeName: read.string(row, "ApplicationSubTypeName"),
    Active: read.bool(row, "Active"),
  };
}

const LISTING_COMMON = [
  "ApproverName",
  "ApproverCode",
  ...DISPLAY_TEXTS.slice(0, 10),
  "ApplicationRefNo",
  "ApplicantCode",
  "ApplicantName",
  "CompanyCode",
  "CompanyName",
  "AreaCode",
  "AreaName",
  "SubAreaCode",
  "SubAreaName",
  ...DISPLAY_TEXTS.slice(10),
];

function mapMyIntray(row: SqlRow): GetMyIntray {
  const item: Record<string, unknown> = {};
  item.ID = read.guid(row, "ID");
  item.RoutingRuleID = read.guid(row, "RoutingRuleID");
  item.SourceID = read.guid(row, "SourceID");
  item.ApproverID = read.guid(row, "ApproverID");
  item.ApproverName = read.stringOrNull(row, "ApproverName");
  item.ApproverCode = read.stringOrNull(row, "ApproverCode");
  for (const name of DISPLAY_TEXTS.slice(0, 10)) item[name] = read.stringOrNull(row, name);
  item.ApplicationRefNo = read.stringOrNull(row, "ApplicationRefNo");
  item.ApplicationID = read.guid(row, "ApplicationID");
  item.ApplicantID = read.guid(row, "ApplicantID");
  for (const name of ["ApplicantCode", "ApplicantName", "CompanyCode", "CompanyName", "AreaCode", "AreaName", "SubAreaCode", "SubAreaName"]) {
    item[name] = read.stringOrNull(row, name);
  }
  item.CreatedDate = read.dateOrNull(row, "CreatedDate");
  item.YesAction = read.string(row, "YesAction");
  item.NoAction = read.stringOrNull(row, "NoAction");
  item.ReworkAction = read.stringOrNull(row, "ReworkAction");
  for (const name of DISPLAY_TEXTS.slice(10)) item[name] = read.stringOrNull(row, name);
  item.PayScaleGroup = read.stringOrNull(row, "PayScaleGroup");
  item.PhoneNumber = read.stringOrNull(row, "PhoneNumber");
  return item as GetMyIntray;
}

const MY_APPROVAL_HISTORY_COLUMNS = [
  "ID",
  "RoutingRuleID",
  "SourceID",
  "ApproverID",
  "ApplicationID",
  "LeaveStatus",
  "ActionDate",
  "ApplicantID",
  "ApproverAction",
  "NoStatus",
  "YesStatus",
  ...LISTING_COMMON,
];

function mapMyApprovalHistory(row: SqlRow): GetMyApprovalHistory {
  const item: Record<string, unknown> = {};
  item.ID = read.guid(row, "ID");
  item.RoutingRuleID = read.guid(row, "RoutingRuleID");
  item.SourceID = read.guid(row, "SourceID");
  item.ApproverID = read.guid(row, "ApproverID");
  item.ApproverName = read.stringOrNull(row, "ApproverName");
  item.ApproverCode = read.stringOrNull(row, "ApproverCode");
  for (const name of DISPLAY_TEXTS.slice(0, 10)) item[name] = read.stringOrNull(row, name);
  item.ApplicationRefNo = read.stringOrNull(row, "ApplicationRefNo");
  item.ApplicationID = read.guid(row, "ApplicationID");
  item.ApproverAction = read.stringOrNull(row, "ApproverAction");
  item.ActionDate = read.dateOrNull(row, "ActionDate");
  item.ApplicantID = read.guidOrNull(row, "ApplicantID");
  for (const name of ["ApplicantCode", "ApplicantName", "CompanyCode", "CompanyName", "AreaCode", "AreaName", "SubAreaCode", "SubAreaName"]) {
    item[name] = read.stringOrNull(row, name);
  }
  item.LeaveStatus = read.string(row, "LeaveStatus");
  item.YesStatus = read.stringOrNull(row, "YesStatus");
  item.NoStatus = read.stringOrNull(row, "NoStatus");
  for (const name of DISPLAY_TEXTS.slice(10)) item[name] = read.stringOrNull(row, name);
  return item as GetMyApprovalHistory;
}

const AUDIT_LOG_COLUMNS = ["Comment", "ActivityAction", "ActivityName", "SourceID", "FormattedDate", "ActionerID", "CreatedDate", "EmployeeCode", "EmployeeName"];

function mapAuditLog(row: SqlRow): GetApprovalAuditLog {
  return {
    ActionerID: read.guidOrNull(row, "ActionerID"),
    EmployeeName: read.stringOrNull(row, "EmployeeName"),
    EmployeeCode: read.stringOrNull(row, "EmployeeCode"),
    Comment: read.string(row, "Comment"),
    ActivityAction: read.string(row, "ActivityAction"),
    ActivityName: read.string(row, "ActivityName"),
    CreatedDate: read.dateOrNull(row, "CreatedDate"),
    SourceID: read.guid(row, "SourceID"),
    FormattedDate: read.string(row, "FormattedDate"),
  };
}

function mapApproverInfo(row: SqlRow): ApproverInfo {
  return {
    ApproverID: read.guid(row, "ApproverID"),
    ApproverLoginName: read.string(row, "ApproverLoginName"),
    ApproverName: read.string(row, "ApproverName"),
    ApproverEmail: read.string(row, "ApproverEmail"),
  };
}

const ALLOW_ACTION_FIELDS = [
  "CanAgree",
  "CanApprove",
  "CanDecline",
  "CanAcknowledge",
  "CanSubmit",
  "CanWithdraw",
  "CanCancel",
  "CanReceive",
  "CanProcess",
  "CanRecommend",
  "CanEndorse",
  "CanVerify",
  "CanRework",
  "CanProcessMemo",
  "CanAgreeCancel",
] as const;

function mapAllowAction(row: SqlRow): AllowAction {
  return Object.fromEntries(ALLOW_ACTION_FIELDS.map((name) => [name, read.string(row, name)])) as AllowAction;
}

// ---------------------------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------------------------

function columns(alias: string, names: string[]) {
  return Prisma.raw(names.map((name) => `[${alias}].[${name}]`).join(", "));
}

function query(sqlQuery: Prisma.Sql) {
  return runSql(() => routingPrisma.$queryRaw<SqlRow[]>(sqlQuery));
}

function execute(sqlQuery: Prisma.Sql) {
  return runSql(() => routingPrisma.$executeRaw(sqlQuery));
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

// _db.Database.SqlQuery<GetMyIntray>($"SELECT * FROM [RM].[GetMyInTray] WHERE ApproverID = {..} AND ApplicationID = {..}")
export async function selectInTray(employeeId: string | null, applicationId: string | null) {
  const result = await query(Prisma.sql`SELECT *
FROM [RM].[GetMyInTray]
WHERE
    ApproverID = ${sqlParam(employeeId)}
    AND ApplicationID = ${sqlParam(applicationId)}`);
  return result.map(mapMyIntray);
}

// select ... from [RM].[GetEmployeeBySourceID]({sourceID}, {role})
export async function selectApproversBySource(sourceID: string, role: string) {
  const result = await query(
    Prisma.sql`select ApproverID, ApproverLoginName, ApproverName, ApproverEmail from [RM].[GetEmployeeBySourceID](${sourceID}, ${role})`,
  );
  return result.map(mapApproverInfo);
}

// select ... from [RM].[GetApproverByApprovalRole]({applicationID}, {employeeID}, {approverType}, {routingRuleID}, '')
export async function selectApproversByRole(applicationID: string, employeeID: string, approverType: string, routingRuleID: string) {
  const result = await query(
    Prisma.sql`select ApproverID, ApproverLoginName, ApproverName, ApproverEmail from [RM].[GetApproverByApprovalRole](${applicationID}, ${employeeID}, ${approverType}, ${routingRuleID}, '')`,
  );
  return result.map(mapApproverInfo);
}

// select ... from [RM].[GetApproverByApprovalRole](..., {sourceID})
export async function selectApproversByRoleAndSource(
  applicationID: string,
  employeeID: string,
  approverType: string,
  routingRuleID: string,
  sourceID: string,
) {
  const result = await query(
    Prisma.sql`select ApproverID, ApproverLoginName, ApproverName, ApproverEmail from [RM].[GetApproverByApprovalRole](${applicationID}, ${employeeID}, ${approverType}, ${routingRuleID}, ${sourceID})`,
  );
  return result.map(mapApproverInfo);
}

// select ... from [RM].[GetApproverByPayScaleGroup]({ApplicationID}, {EmployeeID}, {ApproverType}, {RoutingRuleID}, {SourceID})
export async function selectApproversByPayScaleGroup(
  applicationID: string,
  employeeID: string,
  approverType: string,
  routingRuleID: string,
  sourceID: string,
) {
  const result = await query(
    Prisma.sql`select ApproverID, ApproverLoginName, ApproverName, ApproverEmail from [RM].[GetApproverByPayScaleGroup](${applicationID}, ${employeeID}, ${approverType}, ${routingRuleID}, ${sourceID})`,
  );
  return result.map(mapApproverInfo);
}

// db.EmailTemplates.Where(RoutingRuleID == .. && NotificationType == ..).ToListAsync()
export async function selectEmailTemplates(routingRuleID: string, notificationType: string) {
  const result = await query(Prisma.sql`SELECT ${columns("e", EMAIL_TEMPLATE_COLUMNS)}
FROM [RM].[EmailTemplate] AS [e]
WHERE [e].[RoutingRuleID] = ${routingRuleID} AND [e].[NotificationType] = ${notificationType}`);
  return result.map(mapEmailTemplate);
}

// _db.EmailTemplates.Where(NotificationType == ..).ToListAsync()
export async function selectEmailTemplatesByType(notificationType: string) {
  const result = await query(Prisma.sql`SELECT ${columns("e", EMAIL_TEMPLATE_COLUMNS)}
FROM [RM].[EmailTemplate] AS [e]
WHERE [e].[NotificationType] = ${notificationType}`);
  return result.map(mapEmailTemplate);
}

// _db.EmailTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.ID == templateId)
export async function firstEmailTemplateById(templateId: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("e", EMAIL_TEMPLATE_COLUMNS)}
FROM [RM].[EmailTemplate] AS [e]
WHERE [e].[ID] = ${templateId}`);
  return result.length ? mapEmailTemplate(result[0]) : null;
}

// db.TaskHistories.Where(SourceID == .. && ActivityName == ..).FirstOrDefaultAsync()
export async function firstTaskHistory(sourceID: string, activityName: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("t", TASK_HISTORY_COLUMNS)}
FROM [RM].[TaskHistory] AS [t]
WHERE [t].[SourceID] = ${sourceID} AND [t].[ActivityName] = ${activityName}`);
  return result.length ? mapTaskHistory(result[0]) : null;
}

// _db.Routings.Where(SystemID, ApplicationID, ApplicationTypeID, ApplicationSubTypeID, Active == true).FirstOrDefaultAsync()
export async function firstActiveRouting(systemID: string, applicationID: string, applicationTypeID: string, applicationSubtypeID: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("r", ROUTING_COLUMNS)}
FROM [RM].[Routing] AS [r]
WHERE [r].[SystemID] = ${systemID} AND [r].[ApplicationID] = ${applicationID} AND [r].[ApplicationTypeID] = ${applicationTypeID} AND [r].[ApplicationSubTypeID] = ${applicationSubtypeID} AND [r].[Active] = CAST(1 AS bit)`);
  return result.length ? mapRouting(result[0]) : null;
}

// RoutingRules.Where(RoutingID == .. && ApprovalLevel == ..).FirstOrDefaultAsync()
export async function firstRoutingRuleByLevel(routingID: string, approvalLevel: number) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("r", ROUTING_RULE_COLUMNS)}
FROM [RM].[RoutingRule] AS [r]
WHERE [r].[RoutingID] = ${routingID} AND [r].[ApprovalLevel] = ${approvalLevel}`);
  return result.length ? mapRoutingRule(result[0]) : null;
}

// RoutingRules.Where(ID == ..).FirstOrDefaultAsync()
export async function firstRoutingRuleById(id: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("r", ROUTING_RULE_COLUMNS)}
FROM [RM].[RoutingRule] AS [r]
WHERE [r].[ID] = ${id}`);
  return result.length ? mapRoutingRule(result[0]) : null;
}

// RoutingRules.Where(ID == .. && ApprovalLevel == ..).FirstOrDefaultAsync()
export async function firstRoutingRuleByIdAndLevel(id: string, approvalLevel: number) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("r", ROUTING_RULE_COLUMNS)}
FROM [RM].[RoutingRule] AS [r]
WHERE [r].[ID] = ${id} AND [r].[ApprovalLevel] = ${approvalLevel}`);
  return result.length ? mapRoutingRule(result[0]) : null;
}

// RoutingRules.Where(ID == ..).Select(x => x.CurrentStatus).FirstOrDefaultAsync()
export async function firstRoutingRuleCurrentStatus(id: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) [r].[CurrentStatus]
FROM [RM].[RoutingRule] AS [r]
WHERE [r].[ID] = ${id}`);
  return result.length ? read.stringOrNull(result[0], "CurrentStatus") : null;
}

// Apps.Where(ID == ..).Select(x => x.ApplicationName).FirstOrDefaultAsync()
export async function firstApplicationName(id: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) [a].[ApplicationName]
FROM [Common].[App] AS [a]
WHERE [a].[ID] = ${id}`);
  return result.length ? read.stringOrNull(result[0], "ApplicationName") : null;
}

// Tasks.Where(RoutingRuleID == .. && SourceID == .. && ApprovalLevel == ..).ToListAsync()
export async function selectTasksByRuleSourceLevel(routingRuleID: string, sourceID: string, approvalLevel: number) {
  const result = await query(Prisma.sql`SELECT ${columns("t", TASK_COLUMNS)}
FROM [RM].[Task] AS [t]
WHERE [t].[RoutingRuleID] = ${routingRuleID} AND [t].[SourceID] = ${sourceID} AND [t].[ApprovalLevel] = ${approvalLevel}`);
  return result.map(mapTask);
}

// Tasks.Where(SourceID == .. && ApprovalLevel == ..).ToListAsync()
export async function selectTasksBySourceLevel(sourceID: string, approvalLevel: number) {
  const result = await query(Prisma.sql`SELECT ${columns("t", TASK_COLUMNS)}
FROM [RM].[Task] AS [t]
WHERE [t].[SourceID] = ${sourceID} AND [t].[ApprovalLevel] = ${approvalLevel}`);
  return result.map(mapTask);
}

// Tasks.Where(SourceID == .. && ApprovalLevel == ..).FirstOrDefaultAsync()
export async function firstTaskBySourceLevel(sourceID: string, approvalLevel: number) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("t", TASK_COLUMNS)}
FROM [RM].[Task] AS [t]
WHERE [t].[SourceID] = ${sourceID} AND [t].[ApprovalLevel] = ${approvalLevel}`);
  return result.length ? mapTask(result[0]) : null;
}

// Tasks.Where(ID == ..).FirstOrDefaultAsync() / FirstOrDefaultAsync(x => x.ID == ..)
export async function firstTaskById(id: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) ${columns("t", TASK_COLUMNS)}
FROM [RM].[Task] AS [t]
WHERE [t].[ID] = ${id}`);
  return result.length ? mapTask(result[0]) : null;
}

// Tasks.Where(SourceID == .. && CurrentApproval).ToListAsync()
export async function selectCurrentTasksBySource(sourceID: string) {
  const result = await query(Prisma.sql`SELECT ${columns("t", TASK_COLUMNS)}
FROM [RM].[Task] AS [t]
WHERE [t].[SourceID] = ${sourceID} AND [t].[CurrentApproval] = CAST(1 AS bit)`);
  return result.map(mapTask);
}

// AnyAsync(...): SELECT CASE WHEN EXISTS (...) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END
async function exists(subquery: Prisma.Sql) {
  const result = await query(Prisma.sql`SELECT CASE
    WHEN EXISTS (
        ${subquery}) THEN CAST(1 AS bit)
    ELSE CAST(0 AS bit)
END AS [Value]`);
  return Boolean(result[0]?.Value);
}

// Tasks.AsNoTracking().AnyAsync(SourceID == .. && RoutingRuleID == .. && CurrentApproval == true)
export function anyCurrentTask(sourceID: string, routingRuleID: string) {
  return exists(Prisma.sql`SELECT 1
        FROM [RM].[Task] AS [t]
        WHERE [t].[SourceID] = ${sourceID} AND [t].[RoutingRuleID] = ${routingRuleID} AND [t].[CurrentApproval] = CAST(1 AS bit)`);
}

// Tasks.AsNoTracking().AnyAsync(ID == TaskID && (ApproverID == new Guid(ActionerID) || ActionerID == "0000...") && CurrentApproval == true)
// EF evaluates new Guid(ActionerID) and the string comparison client-side, before any SQL runs.
export function anyOwnedCurrentTask(taskID: string, actionerID: string) {
  const actionerGuid = newGuid(actionerID);
  const actionerIsEmpty = actionerID === EMPTY_GUID;
  return exists(Prisma.sql`SELECT 1
        FROM [RM].[Task] AS [t]
        WHERE [t].[ID] = ${taskID} AND ([t].[ApproverID] = ${actionerGuid} OR ${actionerIsEmpty} = CAST(1 AS bit)) AND [t].[CurrentApproval] = CAST(1 AS bit)`);
}

// Tasks.Where(SourceID == .. && ApprovalLevel < ..).OrderByDescending(ApprovalLevel).Select(ApprovalLevel).FirstOrDefaultAsync()
export async function previousApprovalLevel(sourceID: string, currentLevel: number) {
  const result = await query(Prisma.sql`SELECT TOP(1) [t].[ApprovalLevel]
FROM [RM].[Task] AS [t]
WHERE [t].[SourceID] = ${sourceID} AND [t].[ApprovalLevel] < ${currentLevel}
ORDER BY [t].[ApprovalLevel] DESC`);
  return result.length ? read.int(result[0], "ApprovalLevel") : 0;
}

// Tasks.Where(SourceID == ..).OrderBy(CreatedDate).Select(x => (Guid?)x.ID).FirstOrDefaultAsync()
export async function firstTaskIdBySourceOrderByCreated(sourceID: string) {
  const result = await query(Prisma.sql`SELECT TOP(1) [t].[ID]
FROM [RM].[Task] AS [t]
WHERE [t].[SourceID] = ${sourceID}
ORDER BY [t].[CreatedDate]`);
  return result.length ? read.guidOrNull(result[0], "ID") : null;
}

// _db.GetApprovalAuditLogs.AsNoTracking().Where(SourceID == ..).ToListAsync()
export async function selectAuditLog(sourceID: string) {
  const result = await query(Prisma.sql`SELECT ${columns("g", AUDIT_LOG_COLUMNS)}
FROM [RM].[GetApprovalAuditLog] AS [g]
WHERE [g].[SourceID] = ${sourceID}`);
  return result.map(mapAuditLog);
}

// TransactionScope(ReadUncommitted) + _db.GetMyIntrays.AsNoTracking().Where(ApproverID == ..).Select(ApplicationID)
export async function selectMyIntrayApplicationIds(employeeID: string) {
  const result = await runSql(() =>
    routingPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<SqlRow[]>(Prisma.sql`SELECT [g].[ApplicationID]
FROM [RM].[GetMyIntray] AS [g]
WHERE [g].[ApproverID] = ${employeeID}`),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadUncommitted },
    ),
  );
  return result.map((row) => read.guid(row, "ApplicationID"));
}

// TransactionScope(ReadUncommitted) + _db.GetMyApprovalHistories.AsNoTracking().Where(...)
export async function selectMyApprovalHistory(employeeID: string, applicationID: string | null, dateFrom: Date | null, dateTo: Date | null) {
  const conditions = [Prisma.sql`[g].[ApproverID] = ${employeeID}`];
  if (applicationID !== null) {
    conditions.push(Prisma.sql`[g].[ApplicationID] = ${applicationID}`);
  }
  if (dateFrom !== null && dateTo !== null) {
    conditions.push(Prisma.sql`[g].[ActionDate] >= ${dateFrom}`, Prisma.sql`[g].[ActionDate] <= ${dateTo}`);
  }
  const result = await runSql(() =>
    routingPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<SqlRow[]>(Prisma.sql`SELECT ${columns("g", MY_APPROVAL_HISTORY_COLUMNS)}
FROM [RM].[GetMyApprovalHistory] AS [g]
WHERE ${Prisma.join(conditions, " AND ")}`),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadUncommitted },
    ),
  );
  return result.map(mapMyApprovalHistory);
}

// _db.Database.SqlQuery<AllowAction>($"[RM].[GetAllowAction] {sourceID}, {currentEmployeeID}, {module}")
export async function execGetAllowAction(sourceID: string, currentEmployeeID: string, module: string) {
  const result = await query(Prisma.sql`[RM].[GetAllowAction] ${sourceID}, ${currentEmployeeID}, ${module}`);
  return result.map(mapAllowAction);
}

// ---------------------------------------------------------------------------------------------
// SqlCommand calls (InsertRoutingRestartAsync, InsertRoutingLogAsync, ExecuteRestartRoutingAsync)
// ---------------------------------------------------------------------------------------------

export type RoutingRestartInsert = {
  ID: string;
  ReferenceNo: string | null;
  RoutingType: string;
  ActionerID: string;
  SystemID: string | null;
  ApplicationID: string | null;
  ApplicationTypeID: string | null;
  ApplicationSubtypeID: string | null;
  TaskID: string | null;
  SourceID: string | null;
  ApplicantID: string | null;
  SubmitterID: string | null;
  ApproverID: string | null;
  ApproverAction: string | null;
  ActivityAction: string | null;
  RequestAction: number;
  RoutingRuleID: string | null;
  ActivityName: string;
  CustomApproverID: string | null;
  OptionalApproverRequired: boolean | null;
  OptionalApproverID: string | null;
  AppInfo: string;
};

// [RM].[RoutingRestart_Insert]. @RequestAction is a VarChar parameter given an int (sent as text);
// @AppInfo (SqlDbType.Xml) is sent as text and converted by SQL Server to the XML parameter.
export async function execRoutingRestartInsert(p: RoutingRestartInsert) {
  await execute(Prisma.sql`EXEC [RM].[RoutingRestart_Insert]
    @ID = ${p.ID},
    @ReferenceNo = ${sqlParam(p.ReferenceNo)},
    @RoutingType = ${p.RoutingType},
    @ActionerID = ${p.ActionerID},
    @SystemID = ${sqlParam(p.SystemID)},
    @ApplicationID = ${sqlParam(p.ApplicationID)},
    @ApplicationTypeID = ${sqlParam(p.ApplicationTypeID)},
    @ApplicationSubtypeID = ${sqlParam(p.ApplicationSubtypeID)},
    @TaskID = ${sqlParam(p.TaskID)},
    @SourceID = ${sqlParam(p.SourceID)},
    @ApplicantID = ${sqlParam(p.ApplicantID)},
    @SubmitterID = ${sqlParam(p.SubmitterID)},
    @ApproverID = ${sqlParam(p.ApproverID)},
    @ApproverAction = ${sqlParam(p.ApproverAction)},
    @ActivityAction = ${sqlParam(p.ActivityAction)},
    @RequestAction = ${String(p.RequestAction)},
    @RoutingRuleID = ${sqlParam(p.RoutingRuleID)},
    @ActivityName = ${p.ActivityName},
    @CustomApproverID = ${sqlParam(p.CustomApproverID)},
    @OptionalApproverRequired = ${sqlParam(p.OptionalApproverRequired)},
    @OptionalApproverID = ${sqlParam(p.OptionalApproverID)},
    @AppInfo = ${p.AppInfo}`);
}

export type RoutingLogInsert = {
  ID: string;
  SourceID: string | null;
  RoutingRestartID: string;
  Result: boolean;
  ErrMessage: string;
  RoutingCreated: boolean;
  RoutingRuleCreated: boolean;
  EmailEnabled: boolean;
  EmailSent: boolean;
  ApproverFound: boolean;
  Status: string;
  CurrentStageCompleted: boolean;
  NextApprovalLevel: number;
  NextRoutingRuleID: string;
  NextYesStatus: string;
  NextNoStatus: string;
};

export async function execRoutingLogInsert(p: RoutingLogInsert) {
  await execute(Prisma.sql`EXEC [RM].[RoutingLog_Insert]
    @ID = ${p.ID},
    @SourceID = ${sqlParam(p.SourceID)},
    @RoutingRestartID = ${p.RoutingRestartID},
    @Result = ${p.Result},
    @ErrMessage = ${p.ErrMessage},
    @RoutingCreated = ${p.RoutingCreated},
    @RoutingRuleCreated = ${p.RoutingRuleCreated},
    @EmailEnabled = ${p.EmailEnabled},
    @EmailSent = ${p.EmailSent},
    @ApproverFound = ${p.ApproverFound},
    @Status = ${p.Status},
    @CurrentStageCompleted = ${p.CurrentStageCompleted},
    @NextApprovalLevel = ${p.NextApprovalLevel},
    @NextRoutingRuleID = ${p.NextRoutingRuleID},
    @NextYesStatus = ${p.NextYesStatus},
    @NextNoStatus = ${p.NextNoStatus}`);
}

// `dr[name]` on the SqlDataReader: IndexOutOfRangeException (message = name) for a missing column.
function readerValue(row: SqlRow, name: string): unknown {
  const key = name in row ? name : Object.keys(row).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (key === undefined) {
    throw netErrors.indexOutOfRange(name);
  }
  const raw = row[key];
  return raw === undefined ? null : raw;
}

function readerString(row: SqlRow, name: string) {
  const raw = readerValue(row, name);
  return raw === null ? "" : String(raw);
}

function readerGuid(row: SqlRow, name: string) {
  const raw = readerValue(row, name);
  return raw === null ? null : String(raw).toLowerCase();
}

// CreateRoutingParameters(SqlDataReader)
function mapRoutingParameter(row: SqlRow): RoutingParameter {
  const requestAction = readerValue(row, "RequestAction");
  const optionalApproverRequired = readerValue(row, "OptionalApproverRequired");
  return {
    RoutingType: readerString(row, "RoutingType"),
    ActionerID: readerGuid(row, "ActionerID"),
    SystemID: readerGuid(row, "SystemID"),
    ApplicationID: readerGuid(row, "ApplicationID"),
    ApplicationTypeID: readerGuid(row, "ApplicationTypeID"),
    ApplicationSubtypeID: readerGuid(row, "ApplicationSubTypeID"),
    TaskID: readerGuid(row, "TaskID"),
    SourceID: readerGuid(row, "SourceID"),
    ApplicantID: readerGuid(row, "ApplicantID"),
    SubmitterID: readerGuid(row, "SubmitterID"),
    ApproverID: readerGuid(row, "ApproverID"),
    ApproverAction: readerString(row, "ApproverAction"),
    ActivityAction: readerString(row, "ActivityAction"),
    RequestAction: requestAction === null ? 0 : Number(requestAction),
    RoutingRuleID: readerGuid(row, "RoutingRuleID"),
    AppInfo: deserializeApplicationInfo(readerString(row, "AppInfo")),
    ActivityName: readerString(row, "ActivityName"),
    CustomApproverID: readerGuid(row, "CustomApproverID"),
    OptionalApproverRequired: optionalApproverRequired === null ? null : Boolean(optionalApproverRequired),
    OptionalApproverID: readerGuid(row, "OptionalApproverID"),
  };
}

// ExecuteReaderAsync(CommandBehavior.SingleResult) on [RM].[RoutingRestart_Init]: first result
// set, first row; null when the procedure returns no rows.
export async function execRoutingRestartInit(restartRoutingID: string) {
  const result = await query(Prisma.sql`EXEC [RM].[RoutingRestart_Init] @RestartRoutingID = ${restartRoutingID}`);
  const first = result[0];
  return first ? mapRoutingParameter(first) : null;
}

export async function execRoutingRestartFinalize(restartRoutingID: string) {
  await execute(Prisma.sql`EXEC [RM].[RoutingRestart_Finalize] @RestartRoutingID = ${restartRoutingID}`);
}

// SqlQueryRaw<RoutingRestartIdLookup> (private sealed class in RoutingManagementService.cs).
export type RoutingRestartIdLookup = {
  RoutingRestartID: string | null;
};

export async function selectRoutingRestartIdLookup(id: string): Promise<RoutingRestartIdLookup[]> {
  const rows = await query(Prisma.sql`
            SELECT TOP 1 RoutingRestartID
            FROM RM.RoutingLogs WITH (NOLOCK)
            WHERE ID = ${id} OR RoutingRestartID = ${id}
            `);
  return rows.map((row) => ({ RoutingRestartID: read.guidOrNull(row, "RoutingRestartID") }));
}

// ---------------------------------------------------------------------------------------------
// SaveChanges: added / changed (changed columns only) / removed entities written through the
// Prisma models in one transaction; each update/delete must affect exactly one row (EF's
// optimistic check).
// ---------------------------------------------------------------------------------------------

export type RoutingChange =
  | { kind: "insertTask"; task: RoutingTask }
  | { kind: "updateTask"; id: string; values: Partial<RoutingTask> }
  | { kind: "deleteTask"; id: string }
  | { kind: "insertTaskHistory"; history: TaskHistory };

// Interactive transactions default to a 5s timeout; SaveChanges has no such limit in EF.
const SAVE_CHANGES_TRANSACTION = { maxWait: 15_000, timeout: 600_000 };

// Entity property (C# name) -> Prisma field: ID -> id, RoutingRuleID -> routingRuleId, DisplayText1 -> displayText1.
function toPrismaField(name: string) {
  return name === "ID" ? "id" : name.charAt(0).toLowerCase() + name.slice(1).replace(/ID$/, "Id");
}

function toPrismaData<T>(entity: object): T {
  return Object.fromEntries(Object.entries(entity).map(([name, value]) => [toPrismaField(name), value])) as T;
}

export async function persistRoutingChanges(changes: RoutingChange[]) {
  await routingPrisma.$transaction(async (tx) => {
    for (const change of changes) {
      if (change.kind === "insertTask") {
        await tx.task.create({ data: toPrismaData<Prisma.TaskCreateInput>(change.task) });
      } else if (change.kind === "insertTaskHistory") {
        await tx.taskHistory.create({ data: toPrismaData<Prisma.TaskHistoryCreateInput>(change.history) });
      } else {
        const result =
          change.kind === "updateTask"
            ? await tx.task.updateMany({ where: { id: change.id }, data: toPrismaData<Prisma.TaskUpdateManyMutationInput>(change.values) })
            : await tx.task.deleteMany({ where: { id: change.id } });
        if (result.count !== 1) {
          throw netErrors.dbUpdateConcurrency(result.count);
        }
      }
    }
  }, SAVE_CHANGES_TRANSACTION);
}
