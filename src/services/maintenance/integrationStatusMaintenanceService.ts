import { z } from "zod";
import {
  getIntegrationModules,
  getIntegrationTransactions,
  updateIntegrationStatus,
  type IntegrationTransactionRow,
} from "../../models/maintenance/integrationStatus.js";
import { HttpError } from "../../utils/errors.js";
import { toEssGuid, toEssRoundTripUtc } from "../../utils/essFormat.js";
import { parseDotNetDateTime, parseGuid } from "../../utils/essRequest.js";
import { essField, parseEssBody } from "../../utils/essValidation.js";

// Port of ESS_Backend IntegrationStatusMaintenanceService (+ controller result branches).

// Legacy hardcoded option lists (TNB_ESS_MVC Views/IntegrationStatus/Index.cshtml).
const INTEGRATION_STATUS_OPTIONS = [
  { value: "ALL", label: "- ALL -" },
  { value: "SENT", label: "SENT" },
  { value: "FAILED", label: "FAILED" },
  { value: "RECEIVED", label: "RECEIVED" },
  { value: "ERROR", label: "ERROR" },
];

const REQUEST_STATUS_OPTIONS = [
  { value: "", label: "- ALL -" },
  ...[
    "Draft",
    "Pending",
    "Approved",
    "Acknowledged",
    "Verified",
    "Processing",
    "Processing Memo",
    "Recommended",
    "Withdrawn",
    "Paid",
    "PendingAdmin",
    "PendingSystem",
    "Declined",
    "Returned",
    "Cancelled",
    "Pending Cancellation",
    "Failed",
    "Failed (Leave Application)",
    "Failed (Leave Cancellation)",
    "PendingVoid",
    "Void",
    "Error",
    "SystemError",
  ].map((status) => ({ value: status, label: status })),
];

const MIN_ITEMS_MESSAGE = "At least one item is required to retrigger.";

// [Required] + [MinLength(1)] on Items and [Required] on each item field. ASP.NET rejects these
// with a ProblemDetails 400 before the controller's own ModelState check is ever reached.
const retriggerSchema = z.object({
  items: z
    .array(
      z.object({
        requestId: essField.requiredString("RequestId"),
        moduleCode: essField.requiredString("ModuleCode"),
      }),
      { required_error: "The Items field is required.", invalid_type_error: "The Items field is required." },
    )
    .optional()
    .transform((items, ctx) => {
      const list = items ?? [];
      if (list.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MIN_ITEMS_MESSAGE });
        return z.NEVER;
      }
      return list;
    }),
});

function toDbString(value: string | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function toDbDate(value: string | undefined) {
  return value && value.trim() ? parseDotNetDateTime(value) : null;
}

// ESS binds a parsed Guid to the varchar(max) parameter, which SQL Server converts to uppercase
// GUID text; anything else is passed through trimmed.
function toRequestIdParam(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const guid = parseGuid(trimmed);
  return guid ? guid.toUpperCase() : trimmed;
}

function toDto(row: IntegrationTransactionRow) {
  return {
    requestId: toEssGuid(row.RequestID) ?? "",
    requestNo: row.RequestNo ?? "",
    requestCategory: row.RequestCategory ?? "",
    requestType: row.RequestType ?? "",
    moduleCode: row.ModuleCode ?? "",
    moduleName: row.ModuleName ?? "",
    employeeNo: row.EmployeeCode ?? "",
    employeeName: row.EmployeeName ?? "",
    integrationStatus: row.IntegrationStatus ?? "",
    lastIntegrationDate: row.LastIntegrationDate ? toEssRoundTripUtc(row.LastIntegrationDate) : "",
    errorMessage: row.ErrorMessage ?? "",
    requestStatus: row.RequestStatus ?? "",
    formPath: row.FormPath ?? "",
  };
}

export async function getModuleDropdown() {
  const rows = await getIntegrationModules();
  return rows
    .filter((row) => row.ModuleCode && row.ModuleCode.trim())
    .map((row) => ({ moduleCode: row.ModuleCode ?? "", moduleName: row.ModuleName ?? "" }));
}

export function getIntegrationStatusDropdown() {
  return INTEGRATION_STATUS_OPTIONS;
}

export function getRequestStatusDropdown() {
  return REQUEST_STATUS_OPTIONS;
}

export async function search(params: {
  integrationStatus?: string;
  moduleCode?: string;
  startDate?: string;
  endDate?: string;
  requestStatus?: string;
}) {
  const rows = await getIntegrationTransactions({
    integrationStatus: toDbString(params.integrationStatus),
    startDate: toDbDate(params.startDate),
    endDate: toDbDate(params.endDate),
    module: toDbString(params.moduleCode),
    requestStatus: toDbString(params.requestStatus),
  });
  return rows.map(toDto);
}

// Items are sent one by one with no transaction, as in ESS.
export async function retrigger(input: unknown) {
  const { items } = parseEssBody(retriggerSchema, input);

  let retriggeredCount = 0;
  for (const item of items) {
    if (!item.requestId.trim() || !item.moduleCode.trim()) continue;
    await updateIntegrationStatus(toRequestIdParam(item.requestId), item.moduleCode.trim());
    retriggeredCount++;
  }

  // Unreachable through HTTP ([Required] rejects blank items first); kept for parity.
  if (retriggeredCount === 0) {
    throw new HttpError(400, "No valid integration status records were retriggered.");
  }
  return { retriggeredCount };
}
