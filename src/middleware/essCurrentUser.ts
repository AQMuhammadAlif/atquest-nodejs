import { NextFunction, Request, Response } from "express";
import { isSharePointGroupMember } from "../models/spGroup.js";
import { parseGuid } from "../utils/essRequest.js";

declare global {
  namespace Express {
    interface Request {
      employeeId?: string;
    }
  }
}

// Account Simulator impersonation header sent by the ESS frontend.
const ACT_AS_EMPLOYEE_HEADER = "X-Act-As-Employee-Id";
const ACCOUNT_SIMULATOR_GROUP = "Support Team - Account Simulator";

// Port of ESS CurrentUserService.EmployeeId: the JWT `employeeId` claim, unless a member of
// the Account Simulator SharePoint group sends X-Act-As-Employee-Id.
export async function essCurrentUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const realEmployeeId = req.tokenEmployeeId ? parseGuid(req.tokenEmployeeId) : null;
    const actAsHeader = req.header(ACT_AS_EMPLOYEE_HEADER);
    const simulatedEmployeeId = actAsHeader ? parseGuid(actAsHeader) : null;

    const canActAs =
      simulatedEmployeeId !== null &&
      (realEmployeeId !== null || req.loginName !== undefined) &&
      (await isSharePointGroupMember(ACCOUNT_SIMULATOR_GROUP, realEmployeeId, req.loginName ?? null));

    req.employeeId = (canActAs ? simulatedEmployeeId : realEmployeeId) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}
