import { Request, Response } from "express";
import * as customWorkflowConfigService from "../../services/routingManagement/customWorkflowConfigService.js";
import { WFConfig } from "../../services/routingManagement/customWorkflowConfigService.js";
import { isNullOrEmpty, isNullOrWhiteSpace, NetException } from "../../utils/essDotnet.js";
import { toEssJson } from "../../utils/essFormat.js";
import { queryString } from "../../utils/essRequest.js";
import { essFail, essOk } from "../../utils/essResponse.js";
import { bindEssJsonBody, EssBodySpec, EssModelState } from "../../utils/essValidation.js";

// Port of ESS_Backend Controllers/RoutingManagement/CustomWorkflowConfigController.cs
// ([Route("v{version:apiVersion}/customworkflowconfig")]). [RequirePermission] is not ported.

const wfConfigSpec: EssBodySpec = {
  clrType: "ESS_Backend.Models.RoutingManagement.WFConfig",
  create: () => customWorkflowConfigService.newWFConfig() as unknown as Record<string, unknown>,
  fields: {
    Id: { type: "string?" },
    AreaCode: { type: "string?" },
    AreaName: { type: "string?" },
    SubAreaCode: { type: "string?" },
    SubAreaName: { type: "string?" },
    StartDate: { type: "string?" },
    EndDate: { type: "string?" },
    IMStaffID: { type: "string?" },
    IMOfIMStaffID: { type: "string?" },
    IMStaffName: { type: "string?" },
    IMOfIMStaffName: { type: "string?" },
    IMOfIMStaffEmailAddress: { type: "string?" },
    CompanyCode: { type: "string?" },
  },
};

// A non-nullable `string` action parameter is implicitly [Required].
function bindRouteString(req: Request, ms: EssModelState, name: string) {
  const value = String(req.params[name] ?? "");
  if (isNullOrWhiteSpace(value)) {
    ms.add(name, `The ${name} field is required.`);
  }
  return value;
}

function bindModel(req: Request, ms: EssModelState) {
  return bindEssJsonBody<WFConfig>(req.headers["content-type"], req.essRawBody, ms, "model", wfConfigSpec);
}

// [HttpGet("search")]
export async function search(req: Request, res: Response) {
  const ms = new EssModelState();
  const dateFrom = ms.bind(() => queryString(req, "dateFrom"));
  const dateTo = ms.bind(() => queryString(req, "dateTo"));
  const companyCode = ms.bind(() => queryString(req, "companyCode"));
  const departmentCode = ms.bind(() => queryString(req, "departmentCode"));
  const unitSectionCode = ms.bind(() => queryString(req, "unitSectionCode"));
  ms.throwIfInvalid();

  const data = await customWorkflowConfigService.getConfigListAsync(
    dateFrom ?? null,
    dateTo ?? null,
    companyCode ?? null,
    departmentCode ?? null,
    unitSectionCode ?? null,
  );
  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("{id}")]
export async function getById(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = bindRouteString(req, ms, "id");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(id)) {
    return essFail(res, 400, "id is required.");
  }

  const data = await customWorkflowConfigService.getConfigByIdAsync(id);

  if (data === null || isNullOrEmpty(data.Id)) {
    return essFail(res, 404, "Configuration not found.");
  }

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpPost]
export async function create(req: Request, res: Response) {
  const ms = new EssModelState();
  const model = bindModel(req, ms);
  ms.throwIfInvalid();

  if (model === null) {
    return essFail(res, 400, "Request body is required.");
  }

  await customWorkflowConfigService.addConfigAsync(model);
  essOk(res, true, "Configuration created.");
}

// [HttpPut("{id}")]
export async function update(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = bindRouteString(req, ms, "id");
  const model = bindModel(req, ms);
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(id)) {
    return essFail(res, 400, "id is required.");
  }

  if (model === null) {
    return essFail(res, 400, "Request body is required.");
  }

  model.Id = id;
  await customWorkflowConfigService.updateConfigAsync(model);
  essOk(res, true, "Configuration updated.");
}

// [HttpDelete("{id}")]
export async function remove(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = bindRouteString(req, ms, "id");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(id)) {
    return essFail(res, 400, "id is required.");
  }

  await customWorkflowConfigService.deleteConfigAsync(id);
  essOk(res, true, "Configuration deleted.");
}

// [HttpGet("flexibenefits-task/{requestId}")]
export async function getTaskIdForFlexiBenefits(req: Request, res: Response) {
  const ms = new EssModelState();
  const requestId = bindRouteString(req, ms, "requestId");
  ms.throwIfInvalid();

  if (isNullOrWhiteSpace(requestId)) {
    return essFail(res, 400, "requestId is required.");
  }

  try {
    const taskId = await customWorkflowConfigService.getTaskIdForFlexiBenefitsAsync(requestId);
    essOk(res, taskId, "data retrieved.");
  } catch (ex) {
    // catch (InvalidOperationException) — ObjectDisposedException derives from it.
    if (ex instanceof NetException && (ex.name === "System.InvalidOperationException" || ex.name === "System.ObjectDisposedException")) {
      return essFail(res, 404, ex.message);
    }
    throw ex;
  }
}
