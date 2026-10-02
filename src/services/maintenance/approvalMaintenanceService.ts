import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  activeRoutingExists,
  availableActionExists,
  deleteRuleAndApprovers,
  emailTemplateExistsForRule,
  findRuleWithRouting,
  hasAvailableActions,
  insertRuleWithApprovers,
  listActiveRoutings,
  listCustomApproverIds,
  listRuleLookups,
  searchApprovalRules,
  taskExistsForRule,
  updateRuleAndApprovers,
  type RoutingRuleColumns,
  type RoutingRuleWithRouting,
} from "../../models/maintenance/approvalMaintenance.js";
import { listAvailableActions } from "../../models/maintenance/notificationMaintenance.js";
import { employeeExists } from "../../models/peoplePicker.js";
import { HttpError } from "../../utils/errors.js";
import { toEssGuid, toEssRoundTripUtc } from "../../utils/essFormat.js";
import { parseGuid } from "../../utils/essRequest.js";
import type { PagedResult } from "../../utils/essResponse.js";
import { essField, parseEssBody } from "../../utils/essValidation.js";

// Port of ESS_Backend ApprovalMaintenanceService + ApprovalStepMapper (+ controller result branches).

// ---- ApprovalStepMapper -------------------------------------------------------------------

const STEPS: [number, string][] = [
  [0, "Zero"],
  [1, "One"],
  [2, "Two"],
  [3, "Three"],
  [4, "Four"],
  [5, "Five"],
];
const DEFAULT_LEVEL = 1;
const STEP_RANGE_ERROR = "Approval step must be between 0 and 5.";

const isValidLevel = (level: number) => level >= 0 && level <= 5;

function toStepLabel(level: number) {
  return STEPS.find(([value]) => value === level)?.[1] ?? String(level);
}

// int.TryParse(InvariantCulture-ish): optional sign, digits, surrounding whitespace.
function tryParseInt(text: string) {
  return /^\s*[+-]?\d+\s*$/.test(text) ? Number(text) : null;
}

function resolveLevel(approvalLevel: number | null, approvalStep: string | null | undefined) {
  if (approvalLevel !== null) {
    if (!isValidLevel(approvalLevel)) throw new HttpError(400, STEP_RANGE_ERROR);
    return approvalLevel;
  }
  if (approvalStep && approvalStep.trim()) {
    const normalized = approvalStep.trim();
    const match = STEPS.find(
      ([level, label]) => label.toLowerCase() === normalized.toLowerCase() || String(level) === normalized,
    );
    if (match) return match[0];
    const parsed = tryParseInt(normalized);
    if (parsed !== null && isValidLevel(parsed)) return parsed;
    throw new HttpError(400, STEP_RANGE_ERROR);
  }
  return DEFAULT_LEVEL;
}

export function getApprovalStepDropdown() {
  return STEPS.map(([level, label]) => ({ id: String(level), code: String(level), name: label }));
}

// ---- DTOs ---------------------------------------------------------------------------------

type RuleSummarySource = {
  id: string;
  approvalTitle: string;
  approvalLevel: number;
  approvalRole: string;
  requiredEveryOneAction: boolean;
  skipSameApprover: boolean;
  createdDate: Date | null;
  modifiedDate: Date | null;
};

function toSummaryDto(rule: RuleSummarySource, approvalName: string) {
  return {
    id: toEssGuid(rule.id)!,
    approvalName,
    activityName: rule.approvalTitle,
    assignTo: rule.approvalRole,
    approvalStep: toStepLabel(rule.approvalLevel),
    requiredEveryoneAction: rule.requiredEveryOneAction,
    skipSameApprover: rule.skipSameApprover,
    // ESS FormatDate: a missing CreatedDate is reported as "now".
    createdDate: toEssRoundTripUtc(rule.createdDate ?? new Date()),
    lastModifiedDate: rule.modifiedDate ? toEssRoundTripUtc(rule.modifiedDate) : null,
  };
}

function toDetailDto(rule: RoutingRuleWithRouting, customApproverIds: string[]) {
  return {
    ...toSummaryDto(rule, rule.routing?.routingName ?? ""),
    routingId: toEssGuid(rule.routingId)!,
    currentStatus: rule.currentStatus,
    optionalApproval: rule.optionalApproval,
    yesLabel: rule.yesLabel,
    yesActionLogLabel: rule.yesActionLogLabel,
    yesStatus: rule.yesStatus,
    noStatus: rule.noStatus,
    noLabel: rule.noLabel,
    noActionLogLabel: rule.noActionLogLabel,
    reworkLabel: rule.reworkLabel,
    reworkActionLogLabel: rule.reworkActionLogLabel,
    reworkStatus: rule.reworkStatus,
    changeProcessAfter: rule.changeProcessAfter,
    changeProcessStatus: rule.changeProcessStatus,
    endProcessAfter: rule.endProcessAfter,
    endProcessStatus: rule.endProcessStatus,
    escalateAfter: rule.escalateAfter,
    escalateTo: rule.escalateTo,
    specificApproverIds: customApproverIds.length === 0 ? null : customApproverIds.map((id) => toEssGuid(id)).join(";"),
  };
}

export type ApprovalMaintenanceDetailDto = ReturnType<typeof toDetailDto>;

// ---- Request schemas ----------------------------------------------------------------------

// Nullable reference types are enabled in ESS, so non-nullable `string` properties are
// implicitly [Required] by ASP.NET model validation.
const createSchema = z.object({
  routingId: essField.guid(),
  approvalTitle: essField.requiredString("ApprovalTitle"),
  approvalLevel: essField.optionalInt(),
  approvalStep: essField.optionalString(),
  approvalRole: essField.requiredString("ApprovalRole"),
  currentStatus: essField.optionalString(),
  optionalApproval: essField.bool(false),
  requiredEveryoneAction: essField.bool(false),
  yesLabel: essField.requiredString("YesLabel"),
  yesActionLogLabel: essField.requiredString("YesActionLogLabel"),
  yesStatus: essField.optionalString(),
  noLabel: essField.requiredString("NoLabel"),
  noActionLogLabel: essField.requiredString("NoActionLogLabel"),
  noStatus: essField.optionalString(),
  reworkLabel: essField.optionalString(),
  reworkActionLogLabel: essField.optionalString(),
  reworkStatus: essField.optionalString(),
  escalateAfter: essField.int(99999),
  escalateTo: essField.optionalString(),
  changeProcessAfter: essField.int(99999),
  changeProcessStatus: essField.optionalString(),
  endProcessAfter: essField.int(99999),
  endProcessStatus: essField.optionalString(),
  skipSameApprover: essField.bool(false),
  specificApproverIds: essField.optionalString(),
});

const updateSchema = z.object({
  routingId: z
    .string({ invalid_type_error: "The JSON value could not be converted to System.Nullable`1[System.Guid]." })
    .nullish()
    .transform((value, ctx) => {
      if (value === null || value === undefined) return null;
      const guid = parseGuid(value);
      if (!guid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The JSON value could not be converted to System.Nullable`1[System.Guid].",
        });
        return z.NEVER;
      }
      return guid;
    }),
  approvalName: essField.optionalString(),
  activityName: essField.optionalString(),
  approvalStep: essField.optionalString(),
  assignTo: essField.optionalString(),
  requiredEveryoneAction: essField.optionalBool(),
  skipSameApprover: essField.optionalBool(),
  createdDate: essField.optionalString(),
  lastModifiedDate: essField.optionalString(),
  approvalTitle: essField.optionalString(),
  approvalLevel: essField.optionalInt(),
  approvalRole: essField.optionalString(),
  currentStatus: essField.optionalString(),
  optionalApproval: essField.optionalBool(),
  yesLabel: essField.optionalString(),
  yesActionLogLabel: essField.optionalString(),
  yesStatus: essField.optionalString(),
  noLabel: essField.optionalString(),
  noActionLogLabel: essField.optionalString(),
  noStatus: essField.optionalString(),
  reworkLabel: essField.optionalString(),
  reworkActionLogLabel: essField.optionalString(),
  reworkStatus: essField.optionalString(),
  escalateAfter: essField.optionalInt(),
  escalateTo: essField.optionalString(),
  changeProcessAfter: essField.optionalInt(),
  changeProcessStatus: essField.optionalString(),
  endProcessAfter: essField.optionalInt(),
  endProcessStatus: essField.optionalString(),
  specificApproverIds: essField.optionalString(),
});

// ---- Helpers ------------------------------------------------------------------------------

const isBlank = (value: string | null | undefined): value is null | undefined | "" => !value || !value.trim();

function coalesceText(primary: string | null | undefined, fallback: string | null | undefined) {
  if (!isBlank(primary)) return primary;
  return isBlank(fallback) ? null : fallback;
}

function nullIfBlank(value: string | undefined) {
  return isBlank(value) ? null : value.trim();
}

async function validateAssignTo(approvalRole: string) {
  if (!(await hasAvailableActions())) return;
  const normalized = approvalRole.trim();
  if (!(await availableActionExists(normalized))) {
    throw new HttpError(400, `Assign-to role '${normalized}' is not valid.`);
  }
}

// ESS TryAddCustomApproversAsync: ';'-separated employee GUIDs, each must exist in General.Employee.
async function resolveCustomApprovers(specificApproverIds: string | null | undefined) {
  if (isBlank(specificApproverIds)) return [];

  const approverIds: string[] = [];
  for (const text of specificApproverIds.split(";").map((part) => part.trim()).filter(Boolean)) {
    const approverId = parseGuid(text);
    if (!approverId) {
      throw new HttpError(400, `Invalid employee id '${text}'.`);
    }
    if (!(await employeeExists(approverId))) {
      throw new HttpError(400, `Employee not found: ${approverId}.`);
    }
    approverIds.push(approverId);
  }
  return approverIds;
}

// ---- Queries ------------------------------------------------------------------------------

export async function getAll(params: {
  approvalName?: string;
  activityName?: string;
  assignTo?: string;
  routingId?: string;
  routingRuleId?: string;
  page: number;
  pageSize: number;
}) {
  const rows = await searchApprovalRules({
    routingId: params.routingId ?? null,
    routingRuleId: params.routingRuleId ?? null,
    approvalName: nullIfBlank(params.approvalName),
    activityName: nullIfBlank(params.activityName),
    assignTo: nullIfBlank(params.assignTo),
    offset: (params.page - 1) * params.pageSize,
    pageSize: params.pageSize,
  });

  const result: PagedResult<ReturnType<typeof toSummaryDto>> = {
    items: rows.map((row) =>
      toSummaryDto(
        {
          id: row.ID,
          approvalTitle: row.ApprovalTitle,
          approvalLevel: row.ApprovalLevel,
          approvalRole: row.ApprovalRole,
          requiredEveryOneAction: row.RequiredEveryOneAction,
          skipSameApprover: row.SkipSameApprover,
          createdDate: row.CreatedDate,
          modifiedDate: row.ModifiedDate,
        },
        row.RoutingName,
      ),
    ),
    page: params.page,
    pageSize: params.pageSize,
    totalCount: rows.length > 0 ? Number(rows[0].TotalCount) : 0,
  };
  return result;
}

export async function getById(id: string) {
  const rule = await findRuleWithRouting(id);
  if (!rule) return null;
  return toDetailDto(rule, await listCustomApproverIds(id));
}

export async function getRoutingDropdown() {
  const routings = await listActiveRoutings();
  return routings.map((routing) => {
    const id = toEssGuid(routing.RoutingID)!;
    return { id, code: id, name: routing.RoutingName };
  });
}

export async function getRoutingRuleDdl(routingId?: string) {
  const rules = await listRuleLookups(routingId ?? null);
  return rules.map((rule) => ({
    id: toEssGuid(rule.id)!,
    approvalName: rule.routing.routingName,
    activityName: rule.approvalTitle,
  }));
}

export async function getAssignToDropdown() {
  const actions = await listAvailableActions();
  return actions.map((action) => ({
    id: action.ActionName,
    code: action.ActionName,
    name: action.ActionType ?? action.ActionName,
  }));
}

// ---- Commands -----------------------------------------------------------------------------

export async function create(input: unknown, employeeId: string | undefined) {
  const body = parseEssBody(createSchema, input);

  // Unreachable through HTTP (implicit [Required] rejects these first); kept for parity.
  if (isBlank(body.approvalTitle) || isBlank(body.approvalRole)) {
    throw new HttpError(400, "Approval title and assign-to are required.");
  }

  const approvalLevel = resolveLevel(body.approvalLevel, body.approvalStep);

  if (!(await activeRoutingExists(body.routingId))) {
    throw new HttpError(404, "Routing not found.");
  }

  await validateAssignTo(body.approvalRole);
  const approverIds = await resolveCustomApprovers(body.specificApproverIds);

  const columns: RoutingRuleColumns = {
    routingId: body.routingId,
    approvalTitle: body.approvalTitle.trim(),
    approvalLevel,
    approvalRole: body.approvalRole.trim(),
    currentStatus: body.currentStatus ?? null,
    optionalApproval: body.optionalApproval,
    requiredEveryOneAction: body.requiredEveryoneAction,
    yesLabel: body.yesLabel,
    yesActionLogLabel: body.yesActionLogLabel,
    yesStatus: body.yesStatus ?? null,
    noLabel: body.noLabel,
    noActionLogLabel: body.noActionLogLabel,
    noStatus: body.noStatus ?? null,
    reworkLabel: body.reworkLabel ?? null,
    reworkActionLogLabel: body.reworkActionLogLabel ?? null,
    reworkStatus: body.reworkStatus ?? null,
    changeProcessAfter: body.changeProcessAfter,
    changeProcessStatus: body.changeProcessStatus ?? null,
    escalateAfter: body.escalateAfter,
    escalateTo: body.escalateTo ?? null,
    endProcessAfter: body.endProcessAfter,
    endProcessStatus: body.endProcessStatus ?? null,
    skipSameApprover: body.skipSameApprover,
  };

  const id = randomUUID();
  await insertRuleWithApprovers(id, columns, approverIds, employeeId ?? null, new Date());

  const created = await getById(id);
  if (!created) {
    throw new HttpError(500, "Failed to create approval maintenance record.");
  }
  return created;
}

function validateImmutableFields(rule: RoutingRuleWithRouting, body: z.output<typeof updateSchema>) {
  const nameError = "Approval name cannot be changed after the approval rule is created.";
  if (body.routingId !== null && body.routingId !== rule.routingId.toLowerCase()) {
    throw new HttpError(400, nameError);
  }
  if (!isBlank(body.approvalName) && rule.routing && body.approvalName.trim() !== rule.routing.routingName) {
    throw new HttpError(400, nameError);
  }

  const approvalTitle = coalesceText(body.approvalTitle, body.activityName);
  if (!isBlank(approvalTitle) && approvalTitle.trim() !== rule.approvalTitle) {
    throw new HttpError(400, "Activity name cannot be changed after the approval rule is created.");
  }

  if (body.approvalLevel !== null || !isBlank(body.approvalStep)) {
    if (resolveLevel(body.approvalLevel, body.approvalStep) !== rule.approvalLevel) {
      throw new HttpError(400, "Approval step cannot be changed after the approval rule is created.");
    }
  }
}

export async function update(id: string, input: unknown, employeeId: string | undefined) {
  const body = parseEssBody(updateSchema, input);

  const rule = await findRuleWithRouting(id);
  if (!rule) {
    throw new HttpError(404, "Approval maintenance record not found.");
  }

  validateImmutableFields(rule, body);

  const changes: Partial<RoutingRuleColumns> = {};

  const approvalRole = coalesceText(body.approvalRole, body.assignTo);
  if (!isBlank(approvalRole)) {
    await validateAssignTo(approvalRole);
    changes.approvalRole = approvalRole.trim();
  }

  // `is not null` checks overwrite even with ""; `IsNullOrWhiteSpace` checks skip blanks.
  if (body.currentStatus != null) changes.currentStatus = body.currentStatus;
  if (body.optionalApproval !== null) changes.optionalApproval = body.optionalApproval;
  if (body.requiredEveryoneAction !== null) changes.requiredEveryOneAction = body.requiredEveryoneAction;
  if (body.skipSameApprover !== null) changes.skipSameApprover = body.skipSameApprover;
  if (!isBlank(body.yesLabel)) changes.yesLabel = body.yesLabel;
  if (!isBlank(body.yesActionLogLabel)) changes.yesActionLogLabel = body.yesActionLogLabel;
  if (body.yesStatus != null) changes.yesStatus = body.yesStatus;
  if (!isBlank(body.noLabel)) changes.noLabel = body.noLabel;
  if (!isBlank(body.noActionLogLabel)) changes.noActionLogLabel = body.noActionLogLabel;
  if (body.noStatus != null) changes.noStatus = body.noStatus;
  if (body.reworkLabel != null) changes.reworkLabel = body.reworkLabel;
  if (body.reworkActionLogLabel != null) changes.reworkActionLogLabel = body.reworkActionLogLabel;
  if (body.reworkStatus != null) changes.reworkStatus = body.reworkStatus;
  if (body.changeProcessAfter !== null) changes.changeProcessAfter = body.changeProcessAfter;
  if (body.changeProcessStatus != null) changes.changeProcessStatus = body.changeProcessStatus;
  if (body.escalateAfter !== null) changes.escalateAfter = body.escalateAfter;
  if (body.escalateTo != null) changes.escalateTo = body.escalateTo;
  if (body.endProcessAfter !== null) changes.endProcessAfter = body.endProcessAfter;
  if (body.endProcessStatus != null) changes.endProcessStatus = body.endProcessStatus;

  const approverIds = body.specificApproverIds != null ? await resolveCustomApprovers(body.specificApproverIds) : null;

  await updateRuleAndApprovers(id, changes, approverIds, employeeId ?? null, new Date());

  const updated = await getById(id);
  if (!updated) {
    throw new HttpError(500, "Failed to update approval maintenance record.");
  }
  return updated;
}

export async function remove(id: string) {
  if (!(await findRuleWithRouting(id))) {
    throw new HttpError(404, "Approval maintenance record not found.");
  }
  if (await emailTemplateExistsForRule(id)) {
    throw new HttpError(409, "Routing rule cannot be deleted because notification templates are linked to it.");
  }
  if (await taskExistsForRule(id)) {
    throw new HttpError(409, "Routing rule cannot be deleted because active routing tasks reference it.");
  }
  await deleteRuleAndApprovers(id);
}
