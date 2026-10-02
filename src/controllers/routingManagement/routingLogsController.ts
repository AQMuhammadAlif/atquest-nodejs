import { Request, Response } from "express";
import * as routingLogService from "../../services/routingManagement/routingLogService.js";
import * as routingManagementService from "../../services/routingManagement/routingManagementService.js";
import { EMPTY_GUID, isNullOrWhiteSpace } from "../../utils/essDotnet.js";
import { toEssJson } from "../../utils/essFormat.js";
import { queryDateTime, queryString, routeGuid } from "../../utils/essRequest.js";
import { essFail, essOk } from "../../utils/essResponse.js";
import { EssModelState } from "../../utils/essValidation.js";

// Port of ESS_Backend Controllers/RoutingManagement/RoutingLogsController.cs
// ([Route("v{version:apiVersion}/routinglogs")]). [RequirePermission] is not ported.

// [HttpGet("listing")]
export async function getListing(req: Request, res: Response) {
  const ms = new EssModelState();
  const startDate = ms.bind(() => queryDateTime(req, "startDate"));
  const endDate = ms.bind(() => queryDateTime(req, "endDate"));
  const referenceNo = ms.bind(() => queryString(req, "referenceNo"));
  const result = ms.bind(() => queryString(req, "result"));
  ms.throwIfInvalid();

  const data = await routingLogService.getRoutingLogsAsync(startDate ?? null, endDate ?? null, referenceNo ?? null, result ?? null);
  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpGet("detail/{id}")]
export async function getDetail(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = ms.bind(() => routeGuid(req, "id"));
  ms.throwIfInvalid();

  if (id === EMPTY_GUID) {
    return essFail(res, 400, "id is required.");
  }

  const data = await routingLogService.getRoutingLogDetailAsync(id as string);

  if (data === null) {
    return essFail(res, 404, "Routing log not found.");
  }

  essOk(res, toEssJson(data), "data retrieved.");
}

// [HttpPost("restart/{id}")]
export async function restartRouting(req: Request, res: Response) {
  const ms = new EssModelState();
  const id = ms.bind(() => routeGuid(req, "id"));
  ms.throwIfInvalid();

  if (id === EMPTY_GUID) {
    return essFail(res, 400, "id is required.");
  }

  const result = await routingManagementService.restartRoutingAsync(id as string);
  const message = result.Result ? "Routing restarted." : isNullOrWhiteSpace(result.ErrMessage) ? "Routing restart failed." : result.ErrMessage;

  essOk(res, toEssJson(result), message);
}
