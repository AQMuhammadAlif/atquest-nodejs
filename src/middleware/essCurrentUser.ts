import { NextFunction, Request, Response } from "express";
import { parseGuid } from "../utils/essRequest.js";

declare global {
  namespace Express {
    interface Request {
      employeeId?: string;
      isEssAdmin?: boolean;
    }
  }
}

// TODO: placeholder identity. ESS_Backend resolves the caller's General.Employee id from the
// session (ICurrentUserService.EmployeeId) and IsEssAdmin from [uniten].[IsInGroup] 'ESS Admin'.
// Until atquest links rbac.Users to employees, every request acts as ESS_ACTING_EMPLOYEE_ID.
export function essCurrentUser(req: Request, _res: Response, next: NextFunction) {
  const employeeId = parseGuid(process.env.ESS_ACTING_EMPLOYEE_ID ?? "");
  req.employeeId = employeeId ?? undefined;
  req.isEssAdmin = (process.env.ESS_ACTING_IS_ESS_ADMIN ?? "").trim().toLowerCase() === "true";
  next();
}
