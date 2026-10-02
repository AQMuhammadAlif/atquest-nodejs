import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import * as model from "../../models/routingManagement/routingManagement.js";
import { routingDb, RoutingDbContext } from "../../models/routingManagement/routingDbContext.js";
import type {
  AllowAction,
  ApplicationInfo,
  ApproverInfo,
  GetApprovalAuditLog,
  GetMyApprovalHistory,
  GetMyIntray,
  RoutingRule,
  RoutingTask,
} from "../../models/routingManagement/routingManagement.js";
import {
  addMilliseconds,
  EMPTY_GUID,
  guidEquals,
  isNullOrEmpty,
  isNullOrWhiteSpace,
  NetException,
  netErrors,
  netNow,
  netReplace,
  netToUpper,
  netTrim,
  newGuid,
  truncateToSeconds,
} from "../../utils/essDotnet.js";
import type { PagedResult } from "../../utils/essResponse.js";

// Port of ESS_Backend Services/RoutingManagement/RoutingManagementService.cs. Method order,
// branches, log lines, messages and SaveChanges points follow the C# source.

const log = {
  info: (message: string) => console.info(`[RoutingManagementService] ${message}`),
  warn: (message: string) => console.warn(`[RoutingManagementService] ${message}`),
  error: (error: unknown, message: string) => console.error(`[RoutingManagementService] ${message}`, error),
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Models/RoutingManagement/RoutingManagementModels.cs → RequestAction
export const RequestAction = {
  Agree: 0,
  Verify: 1,
  Rework: 2, // always go back to previous approval level
  RejectProceed: 3,
  RejectEnd: 4,
  Approve: 5,
  Withdraw: 6,
  Acknowledge: 7,
  Receive: 8,
  Process: 9,
  Recommend: 10,
  Endorse: 11,
  ReworkApplicant: 12, // always go back to 0 approval level
} as const;

// Models/RoutingManagement/RoutingManagementModels.cs → RoutingElement (read-only properties).
export type RoutingElement = {
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

function routingElement(
  result: boolean,
  errMessage: string,
  routingCreated: boolean,
  routingRuleCreated: boolean,
  emailEnabled: boolean,
  emailSent: boolean,
  approverFound: boolean,
  status: string,
  currentStageCompleted: boolean,
  nextApprovalLevel = 0,
  nextRoutingRuleID = EMPTY_GUID,
  nextYesStatus = "",
): RoutingElement {
  return {
    Result: result,
    ErrMessage: errMessage,
    RoutingCreated: routingCreated,
    RoutingRuleCreated: routingRuleCreated,
    EmailEnabled: emailEnabled,
    EmailSent: emailSent,
    ApproverFound: approverFound,
    Status: status,
    CurrentStageCompleted: currentStageCompleted,
    NextApprovalLevel: nextApprovalLevel,
    NextRoutingRuleID: nextRoutingRuleID,
    NextYesStatus: nextYesStatus,
    // The 13-argument C# constructor assigns `_nextNoStatus = NextNoStatus;` (the property to its
    // own backing field), so NextNoStatus is always "".
    NextNoStatus: "",
  };
}

// The 13-argument constructor: nextNoStatus is accepted and dropped, as in C#.
function routingElementFull(
  result: boolean,
  errMessage: string,
  routingCreated: boolean,
  routingRuleCreated: boolean,
  emailEnabled: boolean,
  emailSent: boolean,
  approverFound: boolean,
  status: string,
  currentStageCompleted: boolean,
  nextApprovalLevel: number,
  nextRoutingRule: string,
  nextYesStatus: string,
  _nextNoStatus: string,
): RoutingElement {
  return routingElement(
    result,
    errMessage,
    routingCreated,
    routingRuleCreated,
    emailEnabled,
    emailSent,
    approverFound,
    status,
    currentStageCompleted,
    nextApprovalLevel,
    nextRoutingRule,
    nextYesStatus,
  );
}

// Dtos/RoutingManagement/InTrayDto.cs (declaration order).
export type InTrayDto = {
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
  YesAction: string | null;
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

// InTrayDto.FromEntity(GetMyIntray): unused in ESS (the in-tray query maps with MapInTrayRow).
export function inTrayDtoFromEntity(intray: GetMyIntray): InTrayDto {
  return {
    ID: intray.ID,
    RoutingRuleID: intray.RoutingRuleID,
    SourceID: intray.SourceID,
    ApproverID: intray.ApproverID,
    ApproverName: intray.ApproverName,
    ApproverCode: intray.ApproverCode,
    DisplayText1: intray.DisplayText1,
    DisplayText2: intray.DisplayText2,
    DisplayText3: intray.DisplayText3,
    DisplayText4: intray.DisplayText4,
    DisplayText5: intray.DisplayText5,
    DisplayText6: intray.DisplayText6,
    DisplayText7: intray.DisplayText7,
    DisplayText8: intray.DisplayText8,
    DisplayText9: intray.DisplayText9,
    DisplayText10: intray.DisplayText10,
    ApplicationRefNo: intray.ApplicationRefNo,
    ApplicationID: intray.ApplicationID,
    ApplicantID: intray.ApplicantID,
    ApplicantCode: intray.ApplicantCode,
    ApplicantName: intray.ApplicantName,
    CompanyCode: intray.CompanyCode,
    CompanyName: intray.CompanyName,
    AreaCode: intray.AreaCode,
    AreaName: intray.AreaName,
    SubAreaCode: intray.SubAreaCode,
    SubAreaName: intray.SubAreaName,
    CreatedDate: intray.CreatedDate,
    YesAction: intray.YesAction,
    NoAction: intray.NoAction,
    ReworkAction: intray.ReworkAction,
    DisplayText11: intray.DisplayText11,
    DisplayText12: intray.DisplayText12,
    DisplayText13: intray.DisplayText13,
    DisplayText14: intray.DisplayText14,
    DisplayText15: intray.DisplayText15,
    DisplayText16: intray.DisplayText16,
    DisplayText17: intray.DisplayText17,
    DisplayText18: intray.DisplayText18,
    DisplayText19: intray.DisplayText19,
    DisplayText20: intray.DisplayText20,
    PayScaleGroup: intray.PayScaleGroup,
    PhoneNumber: intray.PhoneNumber,
  };
}

// MailOptions bound from the "Mail" section.
function mailOptions() {
  return {
    MAILSERVER: process.env.MAIL_SERVER ?? "",
    MAILFROM: process.env.MAIL_FROM ?? "",
    MAILSERVERPORT: process.env.MAIL_SERVER_PORT ?? "",
    MAILCREDENTIALLOGIN: process.env.MAIL_CREDENTIAL_LOGIN ?? "",
    MAILCREDENTIALPASS: process.env.MAIL_CREDENTIAL_PASS ?? "",
  };
}

// =============================================================================================
// In-tray
// =============================================================================================

export async function getInTrayAsync(
  employeeId: string | null,
  applicationId: string | null,
  page: number,
  pageSize: number,
): Promise<PagedResult<InTrayDto>> {
  log.info(`GetInTrayAsync started for employeeId: ${employeeId}, applicationId: ${applicationId}, page: ${page}, pageSize: ${pageSize}.`);

  try {
    const rows = await queryInTrayAsync(employeeId, applicationId);

    const totalCount = rows.length;
    const items = rows.slice((page - 1) * pageSize).slice(0, pageSize);

    const result = { items, page, pageSize, totalCount };
    log.info(`GetInTrayAsync completed with ${result.items.length}/${totalCount} rows.`);
    return result;
  } catch (ex) {
    log.error(ex, "GetInTrayAsync failed.");
    throw ex;
  }
}

export async function getMyInTrayAsync(employeeID: string, applicationID: string): Promise<InTrayDto[]> {
  log.info(`GetMyInTrayAsync started for employeeID: ${employeeID}, applicationID: ${applicationID}.`);

  try {
    const rows = await queryInTrayAsync(employeeID, applicationID);

    log.info(`GetMyInTrayAsync completed with ${rows.length} rows.`);
    return rows;
  } catch (ex) {
    log.error(ex, "GetMyInTrayAsync failed.");
    throw ex;
  }
}

async function queryInTrayAsync(employeeId: string | null, applicationId: string | null) {
  const rows = await routingDb().use(() => model.selectInTray(toDbString(employeeId), toDbString(applicationId)));
  return rows.map(mapInTrayRow);
}

function mapInTrayRow(row: GetMyIntray): InTrayDto {
  return {
    ID: row.ID,
    RoutingRuleID: row.RoutingRuleID,
    SourceID: row.SourceID,
    ApproverID: row.ApproverID,
    ApproverName: row.ApproverName ?? "",
    ApproverCode: row.ApproverCode ?? "",
    DisplayText1: row.DisplayText1 ?? "",
    DisplayText2: row.DisplayText2 ?? "",
    DisplayText3: row.DisplayText3 ?? "",
    DisplayText4: row.DisplayText4 ?? "",
    DisplayText5: row.DisplayText5 ?? "",
    DisplayText6: row.DisplayText6 ?? "",
    DisplayText7: row.DisplayText7 ?? "",
    DisplayText8: row.DisplayText8 ?? "",
    DisplayText9: row.DisplayText9 ?? "",
    DisplayText10: row.DisplayText10 ?? "",
    ApplicationRefNo: row.ApplicationRefNo ?? "",
    ApplicationID: row.ApplicationID,
    ApplicantID: row.ApplicantID,
    ApplicantCode: row.ApplicantCode ?? "",
    ApplicantName: row.ApplicantName ?? "",
    CompanyCode: row.CompanyCode ?? "",
    CompanyName: row.CompanyName ?? "",
    AreaCode: row.AreaCode ?? "",
    AreaName: row.AreaName ?? "",
    SubAreaCode: row.SubAreaCode ?? "",
    SubAreaName: row.SubAreaName ?? "",
    CreatedDate: row.CreatedDate,
    YesAction: row.YesAction ?? "",
    NoAction: row.NoAction ?? "",
    ReworkAction: row.ReworkAction ?? "",
    DisplayText11: row.DisplayText11 ?? "",
    DisplayText12: row.DisplayText12 ?? "",
    DisplayText13: row.DisplayText13 ?? "",
    DisplayText14: row.DisplayText14 ?? "",
    DisplayText15: row.DisplayText15 ?? "",
    DisplayText16: row.DisplayText16 ?? "",
    DisplayText17: row.DisplayText17 ?? "",
    DisplayText18: row.DisplayText18 ?? "",
    DisplayText19: row.DisplayText19 ?? "",
    DisplayText20: row.DisplayText20 ?? "",
    PayScaleGroup: row.PayScaleGroup ?? "",
    PhoneNumber: row.PhoneNumber ?? "",
  };
}

// string.IsNullOrWhiteSpace(value) ? DBNull.Value : value.Trim()
function toDbString(value: string | null): string | null {
  return isNullOrWhiteSpace(value) ? null : netTrim(value as string);
}

// =============================================================================================
// Email
// =============================================================================================

function replaceMe(text: string, appInfo: ApplicationInfo): string {
  const replacement: [string, string | null][] = [
    ["ApplicantDisplayName", appInfo.ApplicantDisplayName],
    ["ApproverDisplayName", appInfo.ApproverDisplayName],
    ["ApplicationURL", appInfo.ApplicationURL],
    ["Comment", !isNullOrEmpty(appInfo.Comment) && appInfo.Comment.includes("[Hidden]") ? " " : appInfo.Comment],
    ["ReferenceNo", appInfo.ReferenceNo],
    ["RequestorDisplayName", appInfo.RequestorDisplayName],
    ["CustomText1", appInfo.DisplayText1],
    ["CustomText2", appInfo.DisplayText2],
    ["CustomText3", appInfo.DisplayText3],
    ["CustomText4", appInfo.DisplayText4],
    ["CustomText5", appInfo.DisplayText5],
    ["CustomText6", appInfo.DisplayText6],
    ["CustomText7", appInfo.DisplayText7],
    ["CustomText8", appInfo.DisplayText8],
    ["CustomText9", appInfo.DisplayText9],
    ["CustomText10", appInfo.DisplayText10],
    ["CustomText11", appInfo.DisplayText11],
    ["CustomText12", appInfo.DisplayText12],
    ["CustomText13", appInfo.DisplayText13],
    ["CustomText14", appInfo.DisplayText14],
    ["CustomText15", appInfo.DisplayText15],
    ["CustomText16", appInfo.DisplayText16],
    ["CustomText17", appInfo.DisplayText17],
    ["CustomText18", appInfo.DisplayText18],
    ["CustomText19", appInfo.DisplayText19],
    ["CustomText20", appInfo.DisplayText20],
    ["DisplayImage1", appInfo.DisplayImage1],
    ["DisplayImage2", appInfo.DisplayImage2],
    ["DisplayImage3", appInfo.DisplayImage3],
    ["DisplayImage4", appInfo.DisplayImage4],
    ["DisplayImage5", appInfo.DisplayImage5],
    ["DisplayImage6", appInfo.DisplayImage6],
  ];

  for (const [key, value] of replacement) {
    text = netReplace(text, `{${key}}`, value);
  }

  return text;
}

// System.Net.Mail address parsing (MailAddress / MailAddressCollection.Add): every entry of a
// comma-separated list must be a valid address; an empty entry is invalid.
const DOT_ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const QUOTED = '"(?:[^"\\\\]|\\\\.)*"';
const ADDR_SPEC = `(?:${DOT_ATOM}|${QUOTED})@(?:${DOT_ATOM}|\\[[^\\]]*\\])`;
const MAIL_ADDRESS = new RegExp(`^\\s*(?:(?:${QUOTED}|[^<>"]*?)\\s*<\\s*(${ADDR_SPEC})\\s*>|(${ADDR_SPEC}))\\s*$`);

function splitAddressList(list: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (const ch of list) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "<") angle = true;
    if (!quoted && ch === ">") angle = false;
    if (ch === "," && !quoted && !angle) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseMailAddresses(list: string): string[] {
  return splitAddressList(list).map((entry) => {
    const match = MAIL_ADDRESS.exec(entry);
    if (!match) {
      throw netErrors.format("The specified string is not in the form required for an e-mail address.");
    }
    return entry.trim();
  });
}

// Convert.ToInt16(string)
function toInt16(value: string): number {
  // NumberStyles.Integer: leading/trailing white space is U+0009-U+000D and U+0020 only.
  if (!/^[\t-\r ]*[+-]?\d+[\t-\r ]*$/.test(value)) {
    throw netErrors.format(`The input string '${value}' was not in a correct format.`);
  }
  const parsed = Number(value.replace(/^[\t-\r ]+|[\t-\r ]+$/g, ""));
  if (parsed > 32767 || parsed < -32768) {
    throw new NetException("System.OverflowException", "Value was either too large or too small for an Int16.");
  }
  return parsed;
}

export async function sendMailAsync(
  emailTo: string,
  emailCC: string,
  emailBCC: string,
  emailSubject: string,
  emailContent: string,
  isHtmlBody = false,
): Promise<boolean> {
  log.info("SendMailAsync started.");
  const options = mailOptions();
  try {
    // new MailMessage(from, to)
    if (options.MAILFROM === "") {
      throw netErrors.argument("The value cannot be an empty string. (Parameter 'from')");
    }
    if (emailTo === "") {
      throw netErrors.argument("The value cannot be an empty string. (Parameter 'to')");
    }
    // `from` is a single MailAddress; `to` is added as an address list.
    const from = parseMailAddresses(options.MAILFROM);
    if (from.length !== 1) {
      throw netErrors.format("The specified string is not in the form required for an e-mail address.");
    }
    const to = parseMailAddresses(emailTo);

    const cc = !isNullOrEmpty(emailCC) ? parseMailAddresses(emailCC) : [];
    const bcc = !isNullOrEmpty(emailBCC) ? parseMailAddresses(emailBCC) : [];

    const port = toInt16(options.MAILSERVERPORT);
    // SmtpClient: EnableSsl = port != 25 (STARTTLS), credentials always set.
    const client = nodemailer.createTransport({
      host: options.MAILSERVER,
      port,
      secure: false,
      requireTLS: port !== 25,
      ignoreTLS: port === 25,
      auth: { user: options.MAILCREDENTIALLOGIN, pass: options.MAILCREDENTIALPASS },
    });

    log.info(`Host: ${options.MAILSERVER}`);
    log.info(`From: ${options.MAILFROM}`);
    log.info(`Port: ${options.MAILSERVERPORT}`);
    log.info(`Cred: ${options.MAILCREDENTIALLOGIN}`);
    log.info(`Pass: ${options.MAILCREDENTIALPASS}`);

    await client.sendMail({
      from: from[0],
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: emailSubject,
      ...(isHtmlBody ? { html: emailContent } : { text: emailContent }),
    });
    log.info("SendMailAsync completed.");
    return true;
  } catch (ex) {
    log.error(ex, "SendMailAsync failed.");
    return false;
  }
}

// Loads a fixed EmailTemplate by ID and sends it after {TOKEN} substitution.
// Mirrors the legacy LTIP SendConfirmationEmail pattern (template-by-GUID, direct
// recipient) for module-specific notifications that are not driven by routing rules.
export async function sendTemplatedEmailAsync(
  templateId: string,
  emailTo: string,
  tokens: ReadonlyMap<string, string | null>,
): Promise<boolean> {
  log.info(`SendTemplatedEmailAsync started for templateId=${templateId}.`);

  if (isNullOrWhiteSpace(emailTo)) {
    log.warn(`SendTemplatedEmailAsync skipped: empty recipient for templateId=${templateId}.`);
    return false;
  }

  const template = await routingDb().use(() => model.firstEmailTemplateById(templateId));

  if (template === null) {
    log.warn(`SendTemplatedEmailAsync skipped: template ${templateId} not found.`);
    return false;
  }

  let subject = template.Subject ?? "";
  let content = template.ContentTemplate ?? "";
  for (const [key, value] of tokens) {
    subject = netReplace(subject, `{${key}}`, value ?? "");
    content = netReplace(content, `{${key}}`, value ?? "");
  }

  return sendMailAsync(emailTo, "", "", subject, content, template.IsHTMLBody);
}

function configureEmailContent(activityName: string, appInfo: ApplicationInfo, emailSubject: string, emailContent: string) {
  const submissionType = activityName === "Submission" ? "application" : "cancellation";

  emailSubject = replaceMe(netReplace(emailSubject, "{SubmissionType}", submissionType), appInfo);
  emailContent = replaceMe(netReplace(emailContent, "{SubmissionType}", submissionType), appInfo);

  return { emailSubject, emailContent };
}

async function configureEmailContentFromHistoryAsync(
  db: RoutingDbContext,
  sourceID: string,
  activityName: string,
  appInfo: ApplicationInfo,
  emailSubject: string,
  emailContent: string,
) {
  const th = await db.use(() => model.firstTaskHistory(sourceID, activityName));

  const submissionType = th !== null ? "cancellation" : "application";

  emailSubject = replaceMe(netReplace(emailSubject, "{SubmissionType}", submissionType), appInfo);
  emailContent = replaceMe(netReplace(emailContent, "{SubmissionType}", submissionType), appInfo);

  return { emailSubject, emailContent };
}

// =============================================================================================
// Approver lookups
// =============================================================================================

// GetApproverInfoAsync(string sourceID, string role)
export async function getApproverInfoBySourceRoleAsync(sourceID: string, role: string): Promise<ApproverInfo[]> {
  log.info(
    `GetApproverInfoAsync started: select ApproverID, ApproverLoginName, ApproverName, ApproverEmail from [RM].[GetEmployeeBySourceID]('${sourceID}', '${role}')`,
  );
  try {
    const result = await routingDb().use(() => model.selectApproversBySource(sourceID, role));
    log.info("GetApproverInfoAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "GetApproverInfoAsync failed.");
    return [];
  }
}

// GetApproverInfoAsync(actionerID, applicationID, employeeID, approverType, routingRuleID = "")
export async function getApproverInfoAsync(
  actionerID: string,
  applicationID: string,
  employeeID: string,
  approverType: string,
  routingRuleID = "",
): Promise<ApproverInfo[]> {
  log.info(
    `GetApproverInfoAsync started: SELECT * FROM [SEPRoutingManagement].[RM].[GetApproverByApprovalRole] ('${applicationID}', '${employeeID}', '${approverType}', '${routingRuleID}', '')`,
  );
  try {
    const result = await routingDb().use(() => model.selectApproversByRole(applicationID, employeeID, approverType, routingRuleID));
    log.info("GetApproverInfoAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "GetApproverInfoAsync failed.");
    return [];
  }
}

async function getApproverInfoBySourceIDAsync(
  _actionerID: string,
  applicationID: string,
  employeeID: string,
  approverType: string,
  routingRuleID = "",
  sourceID = "",
): Promise<ApproverInfo[]> {
  log.info("GetApproverInfoBySourceIDAsync started.");
  try {
    const result = await routingDb().use(() =>
      model.selectApproversByRoleAndSource(applicationID, employeeID, approverType, routingRuleID, sourceID),
    );
    log.info("GetApproverInfoBySourceIDAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "GetApproverInfoBySourceIDAsync failed.");
    return [];
  }
}

const SOURCE_ROLES_START = ["AllowanceStaff", "AllowanceStaffIM", "LeaveNotifyPeer", "LastActioner", "NotifyPeer", "Offboarding"];

// ConfigureEmailRecipientAsync(List<string> roles, Guid sourceID, string actionerID, ...)
async function configureEmailRecipientForStartAsync(
  roles: string[],
  sourceID: string,
  actionerID: string,
  applicantID: string,
  applicationID: string,
  customApproverID: string,
) {
  log.info("ConfigureEmailRecipientAsync started.");
  let recipients = "";
  let recipientsName = "";

  for (const role of roles) {
    const approvers = SOURCE_ROLES_START.includes(role)
      ? await getApproverInfoBySourceRoleAsync(sourceID, role)
      : netToUpper(role) === "SP" && customApproverID !== EMPTY_GUID
        ? await getApproverInfoAsync(actionerID, applicationID, customApproverID, role, "")
        : await getApproverInfoAsync(actionerID, applicationID, applicantID, role, "");

    if (approvers.length > 0) {
      const emails = approvers.map((x) => x.ApproverEmail).join(",");
      const names = approvers.map((x) => x.ApproverName).join(",");
      recipients = isNullOrEmpty(recipients) ? emails : `${recipients},${emails}`;
      recipientsName = isNullOrEmpty(recipientsName) ? names : `${recipientsName},${names}`;
    }
  }

  log.info("ConfigureEmailRecipientAsync completed.");
  return { recipients, recipientsName };
}

const SOURCE_ROLES_UPDATE = [
  "AllowanceStaff",
  "AllowanceStaffIM",
  "LeaveNotifyPeer",
  "LastActioner",
  "ETKEMSAuthorizedEmployee",
  "NotifyPeer",
  "BantuanSegeraBencanaEmployee",
  "BantuanSegeraBencanaApplicant",
  "BantuanSegeraBencanaFinance",
  "BantuanSegeraBencanaFinanceCC",
];

const SOURCE_ID_ROLES = ["SP-VP", "EPOP-IM", "EPOP-HOD", "EPOP-IM OF IM", "EPOP-HR ADMIN SCC RECRUITING", "EPOP-SCC RECRUITING SPECIALIST", "EPOP-VP"];

// ConfigureEmailRecipientAsync(List<string> roles, Guid sourceID, Guid actionerID, ..., ApplicationInfo appInfo, ...)
async function configureEmailRecipientAsync(
  roles: string[],
  sourceID: string,
  actionerID: string,
  applicantID: string,
  applicationID: string,
  customApproverID: string,
  appInfo: ApplicationInfo,
) {
  log.info("ConfigureEmailRecipientAsync started.");
  let recipients = "";
  let recipientsName = "";

  for (const role of roles) {
    const effectiveRole = role === "IM*12" && appInfo.ReferenceNo.includes("COV01") ? "IM*15" : role;

    let approvers: ApproverInfo[];

    if (SOURCE_ROLES_UPDATE.includes(role)) {
      approvers = await getApproverInfoBySourceRoleAsync(sourceID, role);
    } else if (netToUpper(role) === "SP" && customApproverID !== EMPTY_GUID) {
      approvers = await getApproverInfoAsync(actionerID, applicationID, customApproverID, effectiveRole, "");
    } else if (SOURCE_ID_ROLES.includes(netToUpper(role))) {
      approvers = await getApproverInfoBySourceIDAsync(actionerID, applicationID, applicantID, netToUpper(role), "", sourceID);
    } else {
      approvers = await getApproverInfoAsync(actionerID, applicationID, applicantID, effectiveRole, "");
    }

    if (approvers.length > 0) {
      const emails = approvers.map((x) => x.ApproverEmail).join(",");
      const names = approvers.map((x) => x.ApproverName).join(",");
      recipients = isNullOrEmpty(recipients) ? emails : `${recipients},${emails}`;
      recipientsName = isNullOrEmpty(recipientsName) ? names : `${recipientsName},${names}`;
    }
  }

  log.info("ConfigureEmailRecipientAsync completed.");
  return { recipients, recipientsName };
}

async function sendEmailAsync(
  db: RoutingDbContext,
  routingRuleID: string,
  notificationType: string,
  sourceID: string,
  actionerID: string,
  applicantID: string,
  applicationID: string,
  customApproverID: string,
  appInfo: ApplicationInfo,
  routingType = "UpdateRouting",
  activityName = "",
) {
  log.info("SendEmailAsync started.");
  let emailSent = false;
  let emailEnabled = false;

  const mailTemplates = await db.use(() => model.selectEmailTemplates(routingRuleID, notificationType));

  for (const item of mailTemplates) {
    emailEnabled = item.SendEmail;
    if (!emailEnabled) {
      continue;
    }

    const toRoles = (item.EmailTo ?? "").split(",");
    const ccRoles = (item.EmailCC ?? "").split(",");
    const bccRoles = (item.EmailBCC ?? "").split(",");

    if (routingType === "UpdateRouting") {
      const to = await configureEmailRecipientAsync(toRoles, sourceID, actionerID, applicantID, applicationID, customApproverID, appInfo);
      const cc = await configureEmailRecipientAsync(ccRoles, sourceID, actionerID, applicantID, applicationID, customApproverID, appInfo);
      const bcc = await configureEmailRecipientAsync(bccRoles, sourceID, actionerID, applicantID, applicationID, customApproverID, appInfo);

      const emailSubject = item.Subject;
      const emailContent = netReplace(
        netReplace(item.ContentTemplate, "{ApproverDisplayName}", to.recipientsName),
        "{CurrentApproverDisplayName}",
        appInfo.ApproverDisplayName,
      );

      const content = await configureEmailContentFromHistoryAsync(db, sourceID, activityName, appInfo, emailSubject, emailContent);
      emailSent = await sendMailAsync(to.recipients, cc.recipients, bcc.recipients, content.emailSubject, content.emailContent, item.IsHTMLBody);
    } else if (routingType === "StartRouting") {
      const to = await configureEmailRecipientForStartAsync(toRoles, sourceID, actionerID, applicantID, applicationID, customApproverID);
      const cc = await configureEmailRecipientForStartAsync(ccRoles, sourceID, actionerID, applicantID, applicationID, customApproverID);
      const bcc = await configureEmailRecipientForStartAsync(bccRoles, sourceID, actionerID, applicantID, applicationID, customApproverID);

      const emailSubject = item.Subject;
      const emailContent = netReplace(
        netReplace(item.ContentTemplate, "{ApproverDisplayName}", to.recipientsName),
        "{CurrentApproverDisplayName}",
        appInfo.ApproverDisplayName,
      );

      const content = configureEmailContent(activityName, appInfo, emailSubject, emailContent);
      emailSent = await sendMailAsync(to.recipients, cc.recipients, bcc.recipients, content.emailSubject, content.emailContent, item.IsHTMLBody);
    }
  }

  log.info("SendEmailAsync completed.");
  return { emailSent, emailEnabled };
}

// =============================================================================================
// Task creation
// =============================================================================================

function createTaskHistory(
  db: RoutingDbContext,
  taskID: string | null,
  sourceID: string,
  createdBy: string,
  activityAction: string,
  activityName: string,
  appInfo: ApplicationInfo,
) {
  db.addTaskHistory({
    ID: randomUUID(),
    SourceID: sourceID,
    TaskID: taskID,
    ActivityName: activityName,
    ActivityAction: activityAction,
    Comment: appInfo.Comment,
    CreatedDate: netNow(),
    ModifiedDate: null,
    CreatedBy: createdBy,
    ModifiedBy: null,
  });
}

function newTask(
  applicantID: string,
  applicationID: string,
  routingRuleID: string,
  sourceID: string,
  createdBy: string,
  approvalLevel: number,
  approvalTitle: string,
  approverID: string,
  appInfo: ApplicationInfo,
  createdDate: Date,
): RoutingTask {
  return {
    ID: randomUUID(),
    RoutingRuleID: routingRuleID,
    SourceID: sourceID,
    ApplicationID: applicationID,
    ApplicantID: applicantID,
    ApprovalTitle: approvalTitle,
    ApplicationRefNo: appInfo.ReferenceNo,
    DisplayText1: appInfo.DisplayText1,
    DisplayText2: appInfo.DisplayText2,
    DisplayText3: appInfo.DisplayText3,
    DisplayText4: appInfo.DisplayText4,
    DisplayText5: appInfo.DisplayText5,
    DisplayText6: appInfo.DisplayText6,
    DisplayText7: appInfo.DisplayText7,
    DisplayText8: appInfo.DisplayText8,
    DisplayText9: appInfo.DisplayText9,
    DisplayText10: appInfo.DisplayText10,
    DisplayText11: appInfo.DisplayText11,
    DisplayText12: appInfo.DisplayText12,
    DisplayText13: appInfo.DisplayText13,
    DisplayText14: appInfo.DisplayText14,
    DisplayText15: appInfo.DisplayText15,
    DisplayText16: appInfo.DisplayText16,
    DisplayText17: appInfo.DisplayText17,
    DisplayText18: appInfo.DisplayText18,
    DisplayText19: appInfo.DisplayText19,
    DisplayText20: appInfo.DisplayText20,
    ApprovalLevel: approvalLevel,
    CurrentApproval: true,
    ApproverID: approverID,
    ApproverAction: null,
    Comment: null,
    SkipApproval: null,
    CreatedDate: createdDate,
    ModifiedDate: null,
    CreatedBy: createdBy,
    ModifiedBy: null,
  };
}

function createTask(
  db: RoutingDbContext,
  applicantID: string,
  applicationID: string,
  routingRuleID: string,
  sourceID: string,
  submitterID: string,
  approvalLevel: number,
  approvalTitle: string,
  ap: ApproverInfo,
  appInfo: ApplicationInfo,
): string {
  const task = newTask(applicantID, applicationID, routingRuleID, sourceID, submitterID, approvalLevel, approvalTitle, ap.ApproverID, appInfo, netNow());

  db.addTask(task);

  return task.ID;
}

// =============================================================================================
// StartRouting
// =============================================================================================

export async function startRoutingAsync(
  actionerID: string,
  systemID: string,
  applicationID: string,
  applicationTypeID: string,
  applicationSubtypeID: string,
  sourceID: string,
  applicantID: string,
  submitterID: string,
  appInfo: ApplicationInfo,
  activityName = "",
  customApproverID: string = EMPTY_GUID,
): Promise<RoutingElement> {
  log.info(`StartRoutingAsync started for employeeId: ${appInfo.ApplicantDisplayName}`);
  const db = routingDb();

  let result = false;
  let errMessage = "";
  let routingCreated = false;
  let routingRuleCreated = false;
  let approverFound = false;
  let emailEnabled = false;
  let emailSent = false;

  let nextApprovalLevel = 0;
  let nextRoutingRuleID = EMPTY_GUID;
  let nextYesStatus = "";
  let nextNoStatus = "";
  let routingRuleID = EMPTY_GUID;

  if (activityName === "") {
    activityName = "Submission";
  }

  let re: RoutingElement = routingElement(false, "", false, false, false, false, false, "", false);

  try {
    // STEP 1: GET ROUTING ID
    const routing = await db.use(() => model.firstActiveRouting(systemID, applicationID, applicationTypeID, applicationSubtypeID));

    if (routing !== null) {
      routingCreated = true;

      // STEP 2: Get 1st approval details
      const routingRule = await db.use(() => model.firstRoutingRuleByLevel(routing.ID, 1));

      if (routingRule !== null) {
        routingRuleCreated = true;
        routingRuleID = routingRule.ID;

        // STEP 3: Get Approver details
        const lstApproverInfo =
          customApproverID !== EMPTY_GUID
            ? await getApproverInfoAsync(actionerID, applicationID, customApproverID, routingRule.ApprovalRole, routingRuleID)
            : routingRule.ApprovalRole === "LastActioner"
              ? await getApproverInfoBySourceRoleAsync(sourceID, routingRule.ApprovalRole)
              : await getApproverInfoAsync(actionerID, applicationID, applicantID, routingRule.ApprovalRole, routingRuleID);

        approverFound = lstApproverInfo.length > 0;
        if (approverFound) {
          // STEP 4: Assign task
          for (const ap of lstApproverInfo) {
            createTask(db, applicantID, applicationID, routingRuleID, sourceID, submitterID, 1, routingRule.ApprovalTitle, ap, appInfo);
          }

          nextApprovalLevel = 1;
          nextRoutingRuleID = routingRuleID;
          nextYesStatus = routingRule.YesStatus ?? "";
          nextNoStatus = routingRule.NoStatus ?? "";

          // STEP 5: insert to TaskHistory
          createTaskHistory(db, null, sourceID, submitterID, "Submitted", activityName, appInfo);

          // STEP 6: send email
          ({ emailSent, emailEnabled } = await sendEmailAsync(
            db,
            routingRuleID,
            "SubmissionNotification",
            sourceID,
            newGuid(actionerID),
            applicantID,
            applicationID,
            customApproverID,
            appInfo,
            "StartRouting",
            activityName,
          ));
        } else {
          throw netErrors.generic("Approver or staff is not found/inactive, please check with administrator.");
        }
      } else {
        routingRuleCreated = false;
      }
    } else {
      routingCreated = false;
    }

    await db.saveChanges();
    result = true;
  } catch (ex) {
    log.error(ex, "StartRoutingAsync failed.");
    errMessage = errorMessage(ex);
    result = false;
  } finally {
    re = routingElementFull(
      result,
      errMessage,
      routingCreated,
      routingRuleCreated,
      emailEnabled,
      emailSent,
      approverFound,
      "NEW",
      false,
      nextApprovalLevel,
      nextRoutingRuleID,
      nextYesStatus,
      nextNoStatus,
    );

    if (!re.Result) {
      const routingRestartID = await insertRoutingRestartAsync(
        "Start Routing",
        actionerID,
        systemID,
        applicationID,
        applicationTypeID,
        applicationSubtypeID,
        null,
        sourceID,
        applicantID,
        submitterID,
        null,
        null,
        null,
        0,
        routingRuleID,
        appInfo,
        activityName,
        null,
        null,
        null,
      );
      await insertRoutingLogAsync(re, routingRestartID, sourceID);
    }
  }

  log.info("StartRoutingAsync completed.");
  return re;
}

async function insertRoutingRestartAsync(
  routingType: string,
  actionerID: string,
  systemID: string | null,
  applicationID: string | null,
  applicationTypeID: string | null,
  applicationSubtypeID: string | null,
  taskID: string | null,
  sourceID: string | null,
  applicantID: string | null,
  submitterID: string | null,
  approverID: string | null,
  approverAction: string | null,
  activityAction: string | null,
  requestAction: number,
  routingRuleID: string | null,
  appInfo: ApplicationInfo,
  activityName: string,
  customApproverID: string | null,
  optionalApproverRequired: boolean | null,
  optionalApproverID: string | null,
): Promise<string> {
  log.info("InsertRoutingRestartAsync started.");
  const routingRestartID = randomUUID();

  try {
    const appInfoXml = model.serializeApplicationInfo(appInfo);

    await routingDb().use(() =>
      model.execRoutingRestartInsert(
        {
          ID: routingRestartID,
          ReferenceNo: appInfo.ReferenceNo,
          RoutingType: routingType,
          ActionerID: newGuid(actionerID),
          SystemID: systemID,
          ApplicationID: applicationID,
          ApplicationTypeID: applicationTypeID,
          ApplicationSubtypeID: applicationSubtypeID,
          TaskID: taskID,
          SourceID: sourceID,
          ApplicantID: applicantID,
          SubmitterID: submitterID,
          ApproverID: approverID,
          ApproverAction: approverAction,
          ActivityAction: activityAction,
          RequestAction: requestAction,
          RoutingRuleID: routingRuleID,
          ActivityName: activityName,
          CustomApproverID: customApproverID,
          OptionalApproverRequired: optionalApproverRequired,
          OptionalApproverID: optionalApproverID,
          AppInfo: appInfoXml,
        },
      ),
    );
  } catch {
    // C#: catch { }
  }

  log.info("InsertRoutingRestartAsync completed.");
  return routingRestartID;
}

async function insertRoutingLogAsync(re: RoutingElement, routingRestartID: string, sourceID: string | null) {
  log.info("InsertRoutingLogAsync started.");
  const routingLogID = randomUUID();

  try {
    await routingDb().use(() =>
      model.execRoutingLogInsert(
        {
          ID: routingLogID,
          SourceID: sourceID,
          RoutingRestartID: routingRestartID,
          Result: re.Result,
          ErrMessage: re.ErrMessage,
          RoutingCreated: re.RoutingCreated,
          RoutingRuleCreated: re.RoutingRuleCreated,
          EmailEnabled: re.EmailEnabled,
          EmailSent: re.EmailSent,
          ApproverFound: re.ApproverFound,
          Status: re.Status,
          CurrentStageCompleted: re.CurrentStageCompleted,
          NextApprovalLevel: re.NextApprovalLevel,
          NextRoutingRuleID: re.NextRoutingRuleID,
          NextYesStatus: re.NextYesStatus,
          NextNoStatus: re.NextNoStatus,
        },
      ),
    );
  } catch {
    // C#: catch { }
  }

  log.info("InsertRoutingLogAsync completed.");
  return routingLogID;
}

export async function getTaskDetailsByIDAsync(id: string): Promise<RoutingTask | null> {
  log.info("GetTaskDetailsByIDAsync started.");
  try {
    const db = routingDb();
    const result = await db.trackTask(() => model.firstTaskById(id));
    log.info("GetTaskDetailsByIDAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "GetTaskDetailsByIDAsync failed.");
    throw ex;
  }
}

async function getApproverInfoByPayScaleGroupAsync(
  _actionerID: string,
  applicationID: string,
  employeeID: string,
  approverType: string,
  routingRuleID: string,
  sourceID = "",
): Promise<ApproverInfo[]> {
  log.info("GetApproverInfoByPayScaleGroupAsync started.");
  try {
    const result = await routingDb().use(() =>
      model.selectApproversByPayScaleGroup(applicationID, employeeID, approverType, routingRuleID, sourceID),
    );
    log.info("GetApproverInfoByPayScaleGroupAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "GetApproverInfoByPayScaleGroupAsync failed.");
    return [];
  }
}

const HOD_SP_ROUTING_IDS = ["7b38d861-5830-48f8-adcf-a0518fbecec1", "94217e3f-1dd6-4449-a6d8-d39dfde5bac7"];

async function getApproverListAsync(
  routingRule: RoutingRule,
  sourceID: string,
  applicantID: string,
  applicationID: string,
  actionerID: string,
  _optionalApproverRequired: boolean,
  optionalApproverID: string,
  appInfo: ApplicationInfo,
): Promise<ApproverInfo[]> {
  log.info("GetApproverListAsync started.");

  let approverRole = routingRule.ApprovalRole;
  const routingRuleID = routingRule.ID;

  // Output
  let lstApproverInfo: ApproverInfo[] = [];

  if (approverRole === "IM*12") {
    if (appInfo.ReferenceNo.includes("COV01")) {
      approverRole = "IM*15";
    }
  }

  if (optionalApproverID !== EMPTY_GUID) {
    // Get by selected ApproverID
    if (SOURCE_ID_ROLES.includes(netToUpper(approverRole))) {
      lstApproverInfo = await getApproverInfoBySourceIDAsync(actionerID, applicationID, applicantID, netToUpper(approverRole), "", sourceID);
    } else if (netToUpper(approverRole) === "HOD" && HOD_SP_ROUTING_IDS.some((id) => guidEquals(id, routingRule.RoutingID))) {
      lstApproverInfo = await getApproverInfoAsync(actionerID, applicationID, optionalApproverID, "SP", routingRuleID);
    } else {
      lstApproverInfo = await getApproverInfoAsync(actionerID, applicationID, optionalApproverID, approverRole, routingRuleID);
    }
  } else {
    // Get Approver details by Role
    if (SOURCE_ID_ROLES.includes(netToUpper(approverRole))) {
      lstApproverInfo = await getApproverInfoBySourceIDAsync(actionerID, applicationID, applicantID, netToUpper(approverRole), "", sourceID);
    } else if (approverRole === "PayScaleGroup") {
      lstApproverInfo = await getApproverInfoByPayScaleGroupAsync(actionerID, applicationID, applicantID, netToUpper(approverRole), routingRuleID, "");
    } else {
      lstApproverInfo = await getApproverInfoAsync(actionerID, applicationID, applicantID, approverRole, "");
    }
  }

  log.info("GetApproverListAsync completed.");
  return lstApproverInfo;
}

function createTaskSkipHistory(
  db: RoutingDbContext,
  sourceID: string,
  taskID: string,
  approvalAction: string,
  approvalTitle: string,
  comment: string,
  ap: ApproverInfo,
  currentDateTime: Date,
): Date {
  log.info("CreateTaskSkipHistoryAsync started.");

  currentDateTime = addMilliseconds(currentDateTime, 5);

  db.addTaskHistory({
    ID: randomUUID(),
    SourceID: sourceID,
    TaskID: taskID,
    ActivityAction: approvalAction,
    ActivityName: approvalTitle,
    Comment: comment,
    CreatedBy: ap.ApproverID,
    CreatedDate: currentDateTime,
    ModifiedDate: null,
    ModifiedBy: null,
  });

  log.info("CreateTaskSkipHistoryAsync completed.");
  return currentDateTime;
}

async function isCurrentApprovalStageCompletedAsync(sourceID: string, routingRuleID: string) {
  log.info("IsCurrentApprovalStageCompletedAsync started.");
  try {
    const result = await routingDb().use(() => model.anyCurrentTask(sourceID, routingRuleID));
    log.info("IsCurrentApprovalStageCompletedAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "IsCurrentApprovalStageCompletedAsync failed.");
    return false;
  }
}

export async function isTaskOwnerAsync(actionerID: string, taskID: string) {
  log.info("IsTaskOwnerAsync started.");
  try {
    const result = await routingDb().use(() => model.anyOwnedCurrentTask(taskID, actionerID));
    log.info("IsTaskOwnerAsync completed.");
    return result;
  } catch (ex) {
    log.error(ex, "IsTaskOwnerAsync failed.");
    return false;
  }
}

// =============================================================================================
// UpdateRouting
// =============================================================================================

const APPROVER_NOT_FOUND = "Approver or staff is not found/inactive, please check with administrator.";

export async function updateRoutingAsync(
  actionerID: string,
  systemID: string,
  applicationID: string,
  applicationTypeID: string,
  applicationSubtypeID: string,
  taskID: string,
  sourceID: string,
  applicantID: string,
  approverID: string,
  approverAction: string,
  activityAction: string,
  requestAction: number,
  routingRuleID: string,
  appInfo: ApplicationInfo,
  optionalApproverRequired: boolean,
  optionalApproverID: string,
): Promise<RoutingElement> {
  log.info("UpdateRoutingAsync started.");
  const db = routingDb();

  let result = false;
  let errMessage = "";
  let routingCreated = false;
  let routingRuleCreated = false;
  let approverFound = false;
  let emailEnabled = false;
  let emailSent = false;
  let status = "";

  let nextApprovalLevel = 0;
  let nextRoutingRuleID = EMPTY_GUID;
  let nextYesStatus = "";
  let nextNoStatus = "";

  let routingID = EMPTY_GUID;
  let approverRole = "";
  let approvalTitle = "";

  let isSkipSameApprover = false;
  const activityLabel = activityAction;
  let nextApprovalStep = 0;
  let currApprovalStep = 0;
  let previousApprovalStep = 0;
  let isCurrentStageCompleted = false;

  let re: RoutingElement = routingElement(false, "", false, false, false, false, false, "", false);

  try {
    if (!(await isTaskOwnerAsync(actionerID, taskID))) {
      errMessage =
        "Task not found. The item has been removed from your in-tray. Please contact the System Administrator if this item should still be in your in-tray.";
    } else {
      let routingRule = await db.use(() => model.firstRoutingRuleById(routingRuleID));

      if (routingRule !== null) {
        const isRequiredEveryoneAction = routingRule.RequiredEveryOneAction;
        nextApprovalStep = routingRule.ApprovalLevel + 1;
        currApprovalStep = routingRule.ApprovalLevel;
        previousApprovalStep = routingRule.ApprovalLevel - 1;
        routingID = routingRule.RoutingID;

        nextYesStatus = routingRule.YesStatus ?? "";
        nextNoStatus = routingRule.NoStatus ?? "";

        const currentRule = routingRule;
        const tasks = await db.trackTasks(() => model.selectTasksByRuleSourceLevel(routingRuleID, sourceID, currentRule.ApprovalLevel));

        // update Task
        if (!isRequiredEveryoneAction) {
          // anyone
          for (const t of tasks) {
            // update all task owner to complete
            t.CurrentApproval = false;
            t.SkipApproval = true; // set to true if not needed, at least 1 has taken action
          }
        }

        // update current task owner to complete
        const task = tasks.find((x) => guidEquals(x.ID, taskID)) ?? null;

        if (task !== null) {
          task.ApproverAction = activityLabel;
          task.ModifiedDate = netNow();
          task.ModifiedBy = newGuid(actionerID);
          task.Comment = appInfo.Comment;
          task.CurrentApproval = false;
          task.SkipApproval = false;
        }

        isCurrentStageCompleted = await isCurrentApprovalStageCompletedAsync(sourceID, routingRuleID);
        if (!isCurrentStageCompleted) {
          status = routingRule.CurrentStatus ?? "";
        }

        createTaskHistory(db, taskID, sourceID, newGuid(actionerID), activityLabel, routingRule.ApprovalTitle, appInfo);

        if (isCurrentStageCompleted) {
          switch (requestAction) {
            case RequestAction.Agree:
            case RequestAction.Verify:
            case RequestAction.RejectProceed:
            case RequestAction.RejectEnd:
            case RequestAction.Acknowledge:
            case RequestAction.Receive:
            case RequestAction.Process:
            case RequestAction.Recommend:
            case RequestAction.Endorse: {
              // Get next approval details
              let nextRoutingRule = await db.use(() => model.firstRoutingRuleByLevel(routingID, nextApprovalStep));

              if (nextRoutingRule !== null) {
                // Routing Available
                routingCreated = true;
                routingRuleCreated = true;

                if (requestAction !== RequestAction.RejectEnd) {
                  approverRole = nextRoutingRule.ApprovalRole;
                  routingRuleID = nextRoutingRule.ID;
                  approvalTitle = nextRoutingRule.ApprovalTitle;
                  isSkipSameApprover = nextRoutingRule.SkipSameApprover;

                  let lstApproverInfo: ApproverInfo[] = [];

                  if (optionalApproverRequired || !nextRoutingRule.OptionalApproval) {
                    lstApproverInfo = await getApproverListAsync(
                      nextRoutingRule,
                      sourceID,
                      applicantID,
                      applicationID,
                      newGuid(actionerID),
                      optionalApproverRequired,
                      optionalApproverID,
                      appInfo,
                    );
                  }

                  // If list has any item, set the approverFound Flag
                  approverFound = lstApproverInfo.length > 0;
                  if (approverFound) {
                    let currentDateTime = netNow();

                    // Assign task
                    for (const ap of lstApproverInfo) {
                      if (isSkipSameApprover && lstApproverInfo.length === 1) {
                        // to skip approver if ONLY ONE approver
                        let currentApproverID = ap.ApproverID;

                        while (isSkipSameApprover) {
                          // skip if current approver = next approver
                          if (netToUpper(actionerID) === netToUpper(currentApproverID)) {
                            // create approval log for skipp approver entry
                            currentDateTime = createTaskSkipHistory(
                              db,
                              sourceID,
                              taskID,
                              "Skip Approval",
                              approvalTitle,
                              "Approval skipped: Due to the current and previous approver is the same person - " + ap.ApproverName,
                              ap,
                              currentDateTime,
                            );

                            nextYesStatus = nextRoutingRule?.YesStatus ?? "";
                            nextNoStatus = nextRoutingRule?.NoStatus ?? "";

                            nextApprovalStep += 1;
                            nextRoutingRule = await db.use(() => model.firstRoutingRuleByLevel(routingID, nextApprovalStep));

                            if (nextRoutingRule !== null) {
                              approverRole = nextRoutingRule.ApprovalRole;
                              routingRuleID = nextRoutingRule.ID;
                              approvalTitle = nextRoutingRule.ApprovalTitle;
                              isSkipSameApprover = nextRoutingRule.SkipSameApprover;

                              if (appInfo.OptionalApproverID1 !== EMPTY_GUID) {
                                optionalApproverID = appInfo.OptionalApproverID1;
                              }

                              if (approverRole === "IM*12" && appInfo.ReferenceNo.includes("COV01")) {
                                approverRole = "IM*15";
                              }

                              const lstNextApproverInfo = await getApproverListAsync(
                                nextRoutingRule,
                                sourceID,
                                applicantID,
                                applicationID,
                                newGuid(actionerID),
                                false,
                                appInfo.OptionalApproverID1,
                                appInfo,
                              );

                              if (lstNextApproverInfo.length > 0) {
                                for (const apNext of lstNextApproverInfo) {
                                  currentApproverID = apNext.ApproverID;

                                  // 2019-09-19 add New ApproverID into ap
                                  ap.ApproverID = apNext.ApproverID;

                                  if (isSkipSameApprover && lstNextApproverInfo.length === 1) {
                                    // to skip approver if ONLY ONE approver
                                    isSkipSameApprover = true;
                                  } else {
                                    createTask(db, applicantID, applicationID, routingRuleID, sourceID, newGuid(actionerID), nextApprovalStep, approvalTitle, apNext, appInfo);

                                    // Stop going to next approval level
                                    isSkipSameApprover = false;

                                    nextApprovalLevel = nextApprovalStep;
                                    nextRoutingRuleID = routingRuleID;
                                  }
                                }
                              } else {
                                // To throw exception if no approver Found
                                throw netErrors.generic(APPROVER_NOT_FOUND);
                              }
                            } else {
                              isSkipSameApprover = false;
                            }
                          } else {
                            createTask(db, applicantID, applicationID, routingRuleID, sourceID, newGuid(actionerID), nextApprovalStep, approvalTitle, ap, appInfo);

                            // End the while loop
                            isSkipSameApprover = false;

                            nextApprovalLevel = nextApprovalStep;
                            nextRoutingRuleID = routingRuleID;
                          }
                        }
                      } else {
                        createTask(db, applicantID, applicationID, routingRuleID, sourceID, newGuid(actionerID), nextApprovalStep, approvalTitle, ap, appInfo);

                        nextApprovalLevel = nextApprovalStep;
                        nextRoutingRuleID = routingRuleID;
                      }
                    }

                    // STEP 6: send email
                    ({ emailSent, emailEnabled } = await sendEmailAsync(
                      db,
                      routingRuleID,
                      "SubmissionNotification",
                      sourceID,
                      newGuid(actionerID),
                      applicantID,
                      applicationID,
                      optionalApproverID,
                      appInfo,
                    ));

                    // STEP 7: send email notification for status change
                    ({ emailSent, emailEnabled } = await sendEmailAsync(
                      db,
                      routingRuleID,
                      "StatusChangeNotification",
                      sourceID,
                      newGuid(actionerID),
                      applicantID,
                      applicationID,
                      optionalApproverID,
                      appInfo,
                    ));
                  } else {
                    // To throw exception if no approver Found
                    throw netErrors.generic(APPROVER_NOT_FOUND);
                  }
                } else {
                  ({ emailSent, emailEnabled } = await sendEmailAsync(
                    db,
                    routingRuleID,
                    "RejectedNotification",
                    sourceID,
                    newGuid(actionerID),
                    applicantID,
                    applicationID,
                    optionalApproverID,
                    appInfo,
                  ));
                }
              } else {
                // send approved email: ApprovedNotification
                // (Approve is not one of this case group's labels, so this is unreachable in the C# too.)
                if ((requestAction as number) === RequestAction.Approve) {
                  ({ emailSent, emailEnabled } = await sendEmailAsync(
                    db,
                    routingRuleID,
                    "ApprovedNotification_UNITEN",
                    sourceID,
                    newGuid(actionerID),
                    applicantID,
                    applicationID,
                    EMPTY_GUID,
                    appInfo,
                  ));
                }

                if (requestAction === RequestAction.Acknowledge) {
                  ({ emailSent, emailEnabled } = await sendEmailAsync(
                    db,
                    routingRuleID,
                    "AcknowledgedNotification",
                    sourceID,
                    newGuid(actionerID),
                    applicantID,
                    applicationID,
                    EMPTY_GUID,
                    appInfo,
                  ));
                }

                if (requestAction === RequestAction.RejectEnd) {
                  // send rejected email: RejectedNotification
                  ({ emailSent, emailEnabled } = await sendEmailAsync(
                    db,
                    routingRuleID,
                    "RejectedNotification",
                    sourceID,
                    newGuid(actionerID),
                    applicantID,
                    applicationID,
                    EMPTY_GUID,
                    appInfo,
                  ));
                }
              }
              break;
            }

            case RequestAction.Approve:
              ({ emailSent, emailEnabled } = await sendEmailAsync(
                db,
                routingRuleID,
                "ApprovedNotification_UNITEN",
                sourceID,
                newGuid(actionerID),
                applicantID,
                applicationID,
                EMPTY_GUID,
                appInfo,
              ));

              break;

            case RequestAction.Rework: {
              // re-assign back to previous level
              let repeat = 1;

              if (appInfo.Repeat > 0) {
                repeat = appInfo.Repeat;
              }

              let previousTask: RoutingTask[] | null = null;

              while (repeat > 0) {
                const step = currApprovalStep;
                previousApprovalStep = await db.use(() => model.previousApprovalLevel(sourceID, step));

                const previousStep = previousApprovalStep;
                previousTask = await db.trackTasks(() => model.selectTasksBySourceLevel(sourceID, previousStep));

                for (const t of previousTask) {
                  t.ApproverAction = null;
                  t.Comment = null;
                  t.CurrentApproval = true;
                  t.SkipApproval = false;
                  // Convert.ToDateTime(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                  t.ModifiedDate = netNow();
                  t.ModifiedBy = newGuid(actionerID);
                }

                const currTasks = await db.trackTasks(() => model.selectTasksBySourceLevel(sourceID, step));

                if (appInfo.Remove === 1) {
                  for (const t of currTasks) {
                    db.removeTask(t);
                  }
                }

                currApprovalStep--;

                repeat--;
              }

              const previousStep = previousApprovalStep;
              const pTask = await db.trackTask(() => model.firstTaskBySourceLevel(sourceID, previousStep));

              if (pTask !== null) {
                routingRule = await db.use(() => model.firstRoutingRuleByIdAndLevel(pTask.RoutingRuleID, previousStep));

                if (routingRule !== null) {
                  status = routingRule.CurrentStatus ?? "";
                  nextYesStatus = routingRule.YesStatus ?? "";
                  nextNoStatus = routingRule.NoStatus ?? "";

                  await db.saveChanges();
                }
              }

              for (const t of previousTask ?? []) {
                ({ emailSent, emailEnabled } = await sendEmailAsync(
                  db,
                  routingRuleID,
                  "ReworkNotification",
                  sourceID,
                  newGuid(actionerID),
                  applicantID,
                  applicationID,
                  t.ApproverID,
                  appInfo,
                ));
              }

              break;
            }

            case RequestAction.ReworkApplicant: {
              // re-assign back to 0 level
              const zeroRoutingRule = await db.use(() => model.firstRoutingRuleByLevel(routingID, 0));

              if (zeroRoutingRule !== null) {
                routingCreated = true;
                routingRuleCreated = true;

                approverRole = zeroRoutingRule.ApprovalRole;
                routingRuleID = zeroRoutingRule.ID;
                approvalTitle = zeroRoutingRule.ApprovalTitle;

                let lstApproverInfo: ApproverInfo[] = [];

                if (optionalApproverRequired || !zeroRoutingRule.OptionalApproval) {
                  lstApproverInfo = await getApproverListAsync(
                    zeroRoutingRule,
                    sourceID,
                    applicantID,
                    applicationID,
                    newGuid(actionerID),
                    optionalApproverRequired,
                    optionalApproverID,
                    appInfo,
                  );
                }

                approverFound = lstApproverInfo.length > 0;

                if (approverFound) {
                  for (const ap of lstApproverInfo) {
                    createTask(db, applicantID, applicationID, routingRuleID, sourceID, newGuid(actionerID), 0, approvalTitle, ap, appInfo);
                  }

                  ({ emailSent, emailEnabled } = await sendEmailAsync(
                    db,
                    routingRuleID,
                    "ReworkNotification",
                    sourceID,
                    newGuid(actionerID),
                    applicantID,
                    applicationID,
                    optionalApproverID,
                    appInfo,
                  ));
                } else {
                  // To throw exception if no approver Found
                  throw netErrors.generic(APPROVER_NOT_FOUND);
                }
              }

              break;
            }
          }
        }
      }

      await db.saveChanges();
      result = true;
    }
  } catch (ex) {
    log.error(ex, "UpdateRoutingAsync failed.");

    result = false;
    errMessage = errorMessage(ex);
  } finally {
    re = routingElementFull(
      result,
      errMessage,
      routingCreated,
      routingRuleCreated,
      emailEnabled,
      emailSent,
      approverFound,
      status,
      isCurrentStageCompleted,
      nextApprovalLevel,
      nextRoutingRuleID,
      nextYesStatus,
      nextNoStatus,
    );

    if (!re.Result) {
      const routingRestartID = await insertRoutingRestartAsync(
        "Update Routing",
        actionerID,
        systemID,
        applicationID,
        applicationTypeID,
        applicationSubtypeID,
        taskID,
        sourceID,
        applicantID,
        null,
        approverID,
        approverAction,
        activityAction,
        requestAction,
        routingRuleID,
        appInfo,
        "",
        null,
        optionalApproverRequired,
        optionalApproverID,
      );
      await insertRoutingLogAsync(re, routingRestartID, sourceID);
    }
  }

  log.info("UpdateRoutingAsync completed.");
  return re;
}

export async function getAuditLogHistoryBySourceIDAsync(sourceID: string): Promise<GetApprovalAuditLog[]> {
  log.info("GetAuditLogHistoryBySourceIDAsync started.");

  let auditLogHistory: GetApprovalAuditLog[] = [];
  try {
    auditLogHistory = await routingDb().use(() => model.selectAuditLog(sourceID));
  } catch (ex) {
    log.error(ex, "GetAuditLogHistoryBySourceIDAsync failed.");
  }

  log.info("GetAuditLogHistoryBySourceIDAsync completed.");
  return auditLogHistory;
}

// =============================================================================================
// GotoActivity
// =============================================================================================

export async function gotoActivityAsync(
  actionerID: string,
  _systemID: string,
  applicationID: string,
  _applicationTypeID: string,
  _applicationSubtypeID: string,
  taskID: string,
  sourceID: string,
  applicantID: string,
  _approverID: string,
  _approverAction: string,
  activityAction: string,
  requestAction: number,
  currentRoutingRuleID: string,
  gotoRoutingRuleID: string,
  appInfo: ApplicationInfo,
  optionalApproverIDs: string,
): Promise<RoutingElement> {
  log.info("GotoActivityAsync started.");
  const db = routingDb();
  let result = false;
  const errMessage = "";
  let routingCreated = false;
  let routingRuleCreated = false;
  let approverFound = false;
  let emailEnabled = false;
  let emailSent = false;
  let status = "";

  let approverRole = "";
  let approvalTitle = "";

  const activityLabel = activityAction;
  let gotoApprovalStep = 0;
  const isCurrentStageCompleted = true;

  let re: RoutingElement = routingElement(false, "", false, false, false, false, false, "", false);

  try {
    const routingRule = await db.use(() => model.firstRoutingRuleById(currentRoutingRuleID));
    if (routingRule !== null) {
      switch (requestAction) {
        case RequestAction.Agree:
        case RequestAction.Acknowledge:
        case RequestAction.Approve:
        case RequestAction.Endorse:
        case RequestAction.Process:
        case RequestAction.Receive:
        case RequestAction.Recommend:
        case RequestAction.Verify:
          status = routingRule.YesStatus ?? "";
          break;

        case RequestAction.RejectEnd:
        case RequestAction.RejectProceed:
        case RequestAction.Rework:
        case RequestAction.Withdraw:
          status = routingRule.NoStatus ?? "";

          break;
      }

      // update all taskowner to inactive
      const tasks = await db.trackTasks(() => model.selectTasksByRuleSourceLevel(currentRoutingRuleID, sourceID, routingRule.ApprovalLevel));

      for (const t of tasks) {
        // update all  task owner to complete
        t.ModifiedDate = truncateToSeconds(netNow());
        t.ModifiedBy = newGuid(actionerID);
        t.CurrentApproval = false;
        t.SkipApproval = true; // set to true if not needed, at least 1 has taken action
      }

      // update current taskowner to inactive
      const task = await db.trackTask(() => model.firstTaskById(taskID));

      if (task !== null) {
        // update current task owner to complete
        task.ApproverAction = activityLabel;
        task.ModifiedDate = truncateToSeconds(netNow());
        task.ModifiedBy = newGuid(actionerID);
        task.Comment = appInfo.Comment;
        task.CurrentApproval = false;
        task.SkipApproval = false;
      }

      // create approval log
      db.addTaskHistory({
        ID: randomUUID(),
        SourceID: sourceID,
        TaskID: taskID,
        ActivityAction: activityLabel,
        ActivityName: routingRule.ApprovalTitle,
        Comment: appInfo.Comment,
        CreatedBy: newGuid(actionerID),
        // Convert.ToDateTime(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
        CreatedDate: netNow(),
        ModifiedDate: null,
        ModifiedBy: null,
      });

      // Get Goto approval details
      const gotoRoutingRule = await db.use(() => model.firstRoutingRuleById(gotoRoutingRuleID));

      if (gotoRoutingRule !== null) {
        routingCreated = true;
        routingRuleCreated = true;
        approverRole = gotoRoutingRule.ApprovalRole;
        approvalTitle = gotoRoutingRule.ApprovalTitle;
        gotoApprovalStep = gotoRoutingRule.ApprovalLevel;

        let lstApproverInfo: ApproverInfo[] = [];

        if (!isNullOrEmpty(optionalApproverIDs)) {
          // Get by selected ApproverID
          for (const optionalApproverID of optionalApproverIDs.split(";")) {
            let lstApprover: ApproverInfo[];

            if (netToUpper(approverRole) === "HOD" && HOD_SP_ROUTING_IDS.some((id) => guidEquals(id, gotoRoutingRule.RoutingID))) {
              lstApprover = await getApproverInfoAsync(actionerID, applicationID, optionalApproverID, "SP", gotoRoutingRuleID);
            } else {
              lstApprover = await getApproverInfoAsync(actionerID, applicationID, optionalApproverID, approverRole, gotoRoutingRuleID);
            }

            lstApproverInfo.push(...lstApprover);
          }
        } else {
          // Get Approver details by Role
          lstApproverInfo = await getApproverInfoAsync(actionerID, applicationID, applicantID, approverRole);
        }

        approverFound = lstApproverInfo.length > 0;
        if (approverFound) {
          // Assign task
          for (const ap of lstApproverInfo) {
            db.addTask(
              newTask(
                applicantID,
                applicationID,
                gotoRoutingRuleID,
                sourceID,
                newGuid(actionerID),
                gotoApprovalStep,
                approvalTitle,
                ap.ApproverID,
                appInfo,
                truncateToSeconds(netNow()),
              ),
            );
          }

          // STEP 6: send email
          let emailSubject = "";
          let emailContent = "";

          const mailTemplates = await db.use(() => model.selectEmailTemplates(gotoRoutingRuleID, "GotoNotification"));

          for (const item of mailTemplates) {
            let emailTo = "";
            let emailCC = "";
            let emailBCC = "";
            let emailRecipientName = "";

            let lstApproverInformation: ApproverInfo[] = [];

            let lstRole: string[];

            if (item.SendEmail) {
              emailEnabled = true;
              emailSubject = item.Subject;
              emailContent = item.ContentTemplate;
              // email TO

              lstRole = item.EmailTo.split(",");

              for (const role of lstRole) {
                // custom codes for Allowance
                if (role === "AllowanceStaff" || role === "AllowanceStaffIM") {
                  lstApproverInformation = await getApproverInfoBySourceRoleAsync(sourceID, role);
                } else if (role === "SP" && !isNullOrEmpty(optionalApproverIDs)) {
                  lstApproverInformation = [];

                  for (const optionalApproverID of optionalApproverIDs.split(";")) {
                    const lstApprover = await getApproverInfoAsync(actionerID, applicationID, optionalApproverID, role);

                    lstApproverInformation.push(...lstApprover);
                  }
                } else {
                  // original codes for email notification
                  lstApproverInformation = await getApproverInfoAsync(actionerID, applicationID, applicantID, role);
                }
                for (const email of lstApproverInformation) {
                  emailTo = emailTo + "," + email.ApproverEmail;
                  emailRecipientName = emailRecipientName + ", " + email.ApproverName;
                }
              }

              if (!isNullOrEmpty(emailTo)) {
                emailTo = emailTo.substring(1);
              }

              if (!isNullOrEmpty(emailRecipientName)) {
                emailRecipientName = emailRecipientName.substring(1);
              }

              // email CC
              lstRole = (item.EmailCC ?? "").split(",");

              for (const role of lstRole) {
                // custom codes for Allowance
                if (role === "AllowanceStaff" || role === "AllowanceStaffIM") {
                  lstApproverInformation = await getApproverInfoBySourceRoleAsync(sourceID, role);
                } else {
                  // original codes for email notification
                  lstApproverInformation = await getApproverInfoAsync(actionerID, applicationID, applicantID, role);
                }

                for (const email of lstApproverInformation) {
                  emailCC = emailCC + "," + email.ApproverEmail;
                }
              }

              if (!isNullOrEmpty(emailCC)) {
                emailCC = emailCC.substring(1);
              }

              // email BCC
              lstRole = (item.EmailBCC ?? "").split(",");

              for (const role of lstRole) {
                // custom codes for Allowance
                if (role === "AllowanceStaff" || role === "AllowanceStaffIM") {
                  lstApproverInformation = await getApproverInfoBySourceRoleAsync(sourceID, role);
                } else {
                  // original codes for email notification
                  lstApproverInformation = await getApproverInfoAsync(actionerID, applicationID, applicantID, role);
                }

                for (const email of lstApproverInformation) {
                  emailBCC = emailBCC + "," + email.ApproverEmail;
                }
              }

              if (!isNullOrEmpty(emailBCC)) {
                emailBCC = emailBCC.substring(1);
              }

              // send email
              const th = await db.use(() => model.firstTaskHistory(sourceID, "Leave Cancellation"));

              if (th !== null) {
                // for cancellation
                emailSubject = replaceMe(emailSubject, appInfo);
                emailSubject = netReplace(emailSubject, "{SubmissionType}", "cancellation");
                emailContent = replaceMe(emailContent, appInfo);
                emailContent = netReplace(emailContent, "{SubmissionType}", "cancellation");
              } else {
                emailSubject = replaceMe(emailSubject, appInfo);
                emailSubject = netReplace(emailSubject, "{SubmissionType}", "application");
                emailContent = replaceMe(emailContent, appInfo);
                emailContent = netReplace(emailContent, "{SubmissionType}", "application");
              }

              emailContent = netReplace(emailContent, "{EmailRecipientName}", emailRecipientName);

              emailSent = await sendMailAsync(emailTo, emailCC, emailBCC, emailSubject, emailContent, item.IsHTMLBody);
            }
          }
        } else {
          throw netErrors.generic(APPROVER_NOT_FOUND);
        }
      }
      await db.saveChanges();
      result = true;
    }
  } catch (ex) {
    // C# logs and does not set errMessage here.
    log.error(ex, "GotoActivityAsync failed.");
  } finally {
    re = routingElement(result, errMessage, routingCreated, routingRuleCreated, emailEnabled, emailSent, approverFound, status, isCurrentStageCompleted);
  }
  log.info("GotoActivityAsync completed.");
  return re;
}

// =============================================================================================
// Withdraw / Cancel / Re-assign
// =============================================================================================

export async function withdrawRequestAsync(
  actionerID: string,
  _systemID: string,
  _applicationID: string,
  _applicationTypeID: string,
  _applicationSubtypeID: string,
  sourceID: string,
  comment: string,
): Promise<boolean> {
  log.info("WithdrawRequestAsync started.");
  const db = routingDb();
  let result = false;

  const tasks = await db.trackTasks(() => model.selectCurrentTasksBySource(sourceID));

  if (tasks.length > 0) {
    const now = netNow();
    const actionerGuid = newGuid(actionerID);

    for (const x of tasks) {
      x.CurrentApproval = false;
      x.ModifiedBy = actionerGuid;
      x.ModifiedDate = now;
    }

    await db.saveChanges();

    db.addTaskHistory({
      ID: randomUUID(),
      SourceID: sourceID,
      TaskID: null,
      ActivityAction: "Withdrawn",
      ActivityName: "Withdrawn",
      Comment: comment,
      CreatedBy: actionerGuid,
      CreatedDate: now,
      ModifiedDate: null,
      ModifiedBy: null,
    });

    await db.saveChanges();

    result = true;
  }

  log.info("WithdrawRequestAsync completed.");
  return result;
}

export async function cancelRequestAsync(
  actionerID: string,
  _systemID: string,
  _applicationID: string,
  _applicationTypeID: string,
  _applicationSubtypeID: string,
  sourceID: string,
  comment: string,
): Promise<boolean> {
  log.info("CancelRequestAsync started.");
  const db = routingDb();

  const now = netNow();
  const actionerGuid = newGuid(actionerID);

  // Cancellation only applies to Approved requests, whose approval flow has already run to
  // completion - every task is left with CurrentApproval = false and no new task is created.
  // So an empty list here is the normal case, not a failure: legacy CancelRequest guarded this
  // with `if (Tasks != null)`, which a .ToList() always satisfies, and therefore always logged
  // the "Cancelled" history and returned true. Keep that behaviour; deactivating tasks is the
  // conditional part.
  const tasks = await db.trackTasks(() => model.selectCurrentTasksBySource(sourceID));

  if (tasks.length > 0) {
    for (const x of tasks) {
      x.CurrentApproval = false;
      x.ModifiedBy = actionerGuid;
      x.ModifiedDate = now;
    }

    await db.saveChanges();
  }

  db.addTaskHistory({
    ID: randomUUID(),
    SourceID: sourceID,
    TaskID: null,
    ActivityAction: "Cancelled",
    ActivityName: "Cancelled",
    Comment: comment,
    CreatedBy: actionerGuid,
    CreatedDate: now,
    ModifiedDate: null,
    ModifiedBy: null,
  });

  await db.saveChanges();

  log.info("CancelRequestAsync completed.");
  return true;
}

export async function taskReAssignAsync(
  actionerID: string,
  taskID: string,
  assignedToID: string,
  comment: string,
): Promise<boolean> {
  log.info(`TaskReAssignAsync started for taskID: ${taskID}.`);
  let result = false;

  try {
    // `using var db = _db;` disposes the request's shared context when this block exits, so a
    // second call in the same request fails with ObjectDisposedException.
    const db = routingDb();
    try {
      const task = await db.trackTask(() => model.firstTaskById(taskID));

      if (task === null) {
        log.warn(`TaskReAssignAsync: task ${taskID} not found.`);
        return false;
      }

      const oriApproverID = task.ApproverID;
      const applicantID = task.ApplicantID ?? EMPTY_GUID;
      const applicationID = task.ApplicationID;
      const referenceNo = task.ApplicationRefNo ?? "";
      const approvalTitle = task.ApprovalTitle ?? "";
      const routingRuleID = task.RoutingRuleID;

      const currentStatus = (await db.use(() => model.firstRoutingRuleCurrentStatus(task.RoutingRuleID))) ?? "";

      const applicationName = (await db.use(() => model.firstApplicationName(applicationID))) ?? "";

      const now = netNow();

      task.ApproverID = assignedToID;
      task.ModifiedBy = actionerID;
      task.ModifiedDate = now;
      const sourceID = task.SourceID;
      await db.saveChanges();

      db.addTaskHistory({
        ID: randomUUID(),
        SourceID: sourceID,
        TaskID: null,
        ActivityAction: "Reassigned",
        ActivityName: "Task Re-Assignment",
        Comment: comment,
        CreatedBy: actionerID,
        CreatedDate: now,
        ModifiedDate: null,
        ModifiedBy: null,
      });
      await db.saveChanges();

      result = true;

      try {
        const appInfo = model.newApplicationInfo();
        appInfo.ReferenceNo = referenceNo;
        appInfo.DisplayText2 = applicationName ?? "";
        appInfo.DisplayText5 = approvalTitle;
        appInfo.DisplayText6 = currentStatus ?? "";

        const applicantInfo = await getApproverInfoAsync(actionerID, applicationID, applicantID, "SP", routingRuleID);
        const oriApproverInfo = await getApproverInfoAsync(actionerID, applicationID, oriApproverID, "SP", routingRuleID);
        const newApproverInfo = await getApproverInfoAsync(actionerID, applicationID, assignedToID, "SP", routingRuleID);

        const applicant = applicantInfo[0] ?? null;
        const oriApprover = oriApproverInfo[0] ?? null;
        const newApprover = newApproverInfo[0] ?? null;

        appInfo.ApplicantDisplayName = applicant?.ApproverName ?? "";
        appInfo.DisplayText1 = extractLoginName(applicant?.ApproverLoginName);
        appInfo.DisplayText3 = oriApprover?.ApproverName ?? "";
        appInfo.DisplayText4 = newApprover?.ApproverName ?? "";
        appInfo.ApproverDisplayName = newApprover?.ApproverName ?? "";

        const newApproverEmail = newApprover?.ApproverEmail ?? "";
        const oriApproverEmail = oriApprover?.ApproverEmail ?? "";
        const applicantEmail = applicant?.ApproverEmail ?? "";

        if (!isNullOrWhiteSpace(newApproverEmail)) {
          const ccList = [oriApproverEmail, applicantEmail].filter((e) => !isNullOrWhiteSpace(e)).join(",");
          await sendCustomEmailByNotificationTypeAsync("TaskRe-AssignNotification", appInfo, newApproverEmail, ccList, "");
        }
      } catch (emailEx) {
        log.error(emailEx, `TaskReAssignAsync: failed to send re-assignment notification for taskID ${taskID}.`);
      }
    } finally {
      db.dispose();
    }
  } catch (ex) {
    log.error(ex, `TaskReAssignAsync failed for taskID ${taskID}.`);
    throw ex;
  }

  log.info(`TaskReAssignAsync completed for taskID: ${taskID}.`);
  return result;
}

function extractLoginName(loginName: string | null | undefined): string {
  if (isNullOrWhiteSpace(loginName)) {
    return "";
  }

  const parts = (loginName as string).split("\\");
  return parts.length > 1 ? parts[1] : (loginName as string);
}

// SendCustomEmailByNotificationTypeAsync(notificationType, appInfo, emailTo, emailCC = "", emailBCC = "")
export async function sendCustomEmailByNotificationTypeAsync(
  notificationType: string,
  appInfo: ApplicationInfo,
  emailTo: string,
  emailCC = "",
  emailBCC = "",
): Promise<boolean> {
  log.info("SendCustomEmailByNotificationTypeAsync started.");
  let result = false;

  const mailTemplates = await routingDb().use(() => model.selectEmailTemplatesByType(notificationType));

  for (const item of mailTemplates) {
    if (!item.SendEmail) {
      continue;
    }

    const emailSubject = replaceMe(item.Subject, appInfo);
    const emailContent = replaceMe(item.ContentTemplate, appInfo);

    if (!isNullOrEmpty(emailTo)) {
      result = await sendMailAsync(emailTo, emailCC, emailBCC, emailSubject, emailContent, item.IsHTMLBody);
    }
  }

  log.info("SendCustomEmailByNotificationTypeAsync completed.");
  return result;
}

// SendCustomEmailByNotificationTypeAsync(notificationType, routingRuleID, appInfo, emailTo, emailCC = "", emailBCC = "")
export async function sendCustomEmailByNotificationTypeForRuleAsync(
  notificationType: string,
  routingRuleID: string,
  appInfo: ApplicationInfo,
  emailTo: string,
  emailCC = "",
  emailBCC = "",
): Promise<boolean> {
  log.info("SendCustomEmailByNotificationTypeAsync started.");
  let result = false;

  const mailTemplates = await routingDb().use(() => model.selectEmailTemplates(routingRuleID, notificationType));

  for (const item of mailTemplates) {
    if (!item.SendEmail) {
      continue;
    }

    const emailSubject = replaceMe(item.Subject, appInfo);
    const emailContent = netReplace(replaceMe(item.ContentTemplate, appInfo), "{ApproverDisplayName}", appInfo.ApproverDisplayName);

    if (!isNullOrEmpty(emailTo)) {
      result = await sendMailAsync(emailTo, emailCC, emailBCC, emailSubject, emailContent, item.IsHTMLBody);
    }
  }

  log.info("SendCustomEmailByNotificationTypeAsync completed.");
  return result;
}

// =============================================================================================
// Read endpoints
// =============================================================================================

export async function getUserAllowActionAsync(sourceID: string, currentEmployeeID: string, module = ""): Promise<AllowAction[]> {
  log.info("GetUserAllowActionAsync started.");
  let actionList: AllowAction[] = [];

  try {
    actionList = await routingDb().use(() => model.execGetAllowAction(sourceID, currentEmployeeID, module));
  } catch (ex) {
    log.error(ex, "GetUserAllowActionAsync failed.");
  }

  log.info("GetUserAllowActionAsync completed.");
  return actionList;
}

export async function insertWorkflowHistoryAsync(
  sourceID: string,
  activityAction: string,
  activityName: string,
  comments: string,
  actionerID: string,
): Promise<boolean> {
  log.info("InsertWorkflowHistoryAsync started.");
  const db = routingDb();
  let result = false;

  db.addTaskHistory({
    ID: randomUUID(),
    SourceID: sourceID,
    TaskID: null,
    ActivityAction: activityAction,
    ActivityName: activityName,
    Comment: comments,
    CreatedBy: actionerID,
    CreatedDate: netNow(),
    ModifiedDate: null,
    ModifiedBy: null,
  });

  await db.saveChanges();
  result = true;

  log.info("InsertWorkflowHistoryAsync completed.");
  return result;
}

export async function getMyIntraySummaryAsync(employeeID: string): Promise<string[]> {
  log.info("GetMyIntraySummaryAsync started.");
  let myTasks: string[] = [];

  try {
    myTasks = await routingDb().use(() => model.selectMyIntrayApplicationIds(employeeID));
  } catch (ex) {
    log.error(ex, "GetMyIntraySummaryAsync failed.");
  }

  log.info("GetMyIntraySummaryAsync completed.");
  return myTasks;
}

// The three GetMyApprovalHistoryAsync overloads: (employeeID), (employeeID, applicationID) and
// (employeeID, applicationID, dateFrom, dateTo).
export async function getMyApprovalHistoryAsync(
  employeeID: string,
  applicationID: string | null = null,
  dateFrom: Date | null = null,
  dateTo: Date | null = null,
): Promise<GetMyApprovalHistory[]> {
  log.info("GetMyApprovalHistoryAsync started.");
  let myTasks: GetMyApprovalHistory[] = [];

  try {
    myTasks = await routingDb().use(() => model.selectMyApprovalHistory(employeeID, applicationID, dateFrom, dateTo));
  } catch (ex) {
    log.error(ex, "GetMyApprovalHistoryAsync failed.");
  }

  log.info("GetMyApprovalHistoryAsync completed.");
  return myTasks;
}

// =============================================================================================
// RestartRouting
// =============================================================================================

export async function restartRoutingAsync(restartRoutingID: string): Promise<RoutingElement> {
  log.info(`RestartRoutingAsync started for ${restartRoutingID}.`);

  const result = await executeRestartRoutingAsync(restartRoutingID);

  return result;
}

async function executeRestartRoutingAsync(restartRoutingID: string): Promise<RoutingElement> {
  try {
    const db = routingDb();
    const rp = await db.use(() => model.execRoutingRestartInit(restartRoutingID));

    if (rp === null) {
      return routingElement(false, "Routing Restart not found.", false, false, false, false, false, "Failed", false);
    }

    const actionerId = rp.ActionerID ?? EMPTY_GUID;
    let re: RoutingElement = routingElement(false, "", false, false, false, false, false, "", false);

    if (rp.RoutingType === "Start Routing") {
      re = await startRoutingAsync(
        actionerId,
        rp.SystemID ?? EMPTY_GUID,
        rp.ApplicationID ?? EMPTY_GUID,
        rp.ApplicationTypeID ?? EMPTY_GUID,
        rp.ApplicationSubtypeID ?? EMPTY_GUID,
        rp.SourceID ?? EMPTY_GUID,
        rp.ApplicantID ?? EMPTY_GUID,
        rp.SubmitterID ?? EMPTY_GUID,
        rp.AppInfo ?? model.newApplicationInfo(),
        rp.ActivityName,
        rp.CustomApproverID ?? EMPTY_GUID,
      );
    } else if (rp.RoutingType === "Update Routing") {
      re = await updateRoutingAsync(
        actionerId,
        rp.SystemID ?? EMPTY_GUID,
        rp.ApplicationID ?? EMPTY_GUID,
        rp.ApplicationTypeID ?? EMPTY_GUID,
        rp.ApplicationSubtypeID ?? EMPTY_GUID,
        rp.TaskID ?? EMPTY_GUID,
        rp.SourceID ?? EMPTY_GUID,
        rp.ApplicantID ?? EMPTY_GUID,
        rp.ApproverID ?? EMPTY_GUID,
        rp.ApproverAction,
        rp.ActivityAction,
        rp.RequestAction,
        rp.RoutingRuleID ?? EMPTY_GUID,
        rp.AppInfo ?? model.newApplicationInfo(),
        rp.OptionalApproverRequired ?? false,
        rp.OptionalApproverID ?? EMPTY_GUID,
      );
    } else {
      return routingElement(false, "This routing already been successfully restarted previously.", false, false, false, false, false, "Failed", false);
    }

    if (re.Result) {
      await db.use(() => model.execRoutingRestartFinalize(restartRoutingID));
    }

    return re;
  } catch (ex) {
    log.error(ex, `RestartRoutingAsync failed for ${restartRoutingID}.`);
    return routingElement(false, "Routing restart failed.", false, false, false, false, false, "Failed", false);
  }
}

// Private in ESS and never called there either; ported as-is in case it is needed.
async function resolveRoutingRestartIdAsync(id: string): Promise<string | null> {
  const rows = await routingDb().use(() => model.selectRoutingRestartIdLookup(id));
  return rows[0]?.RoutingRestartID ?? null;
}

function isRestartNotFound(result: RoutingElement): boolean {
  return !result.Result && result.ErrMessage === "Routing Restart not found.";
}
