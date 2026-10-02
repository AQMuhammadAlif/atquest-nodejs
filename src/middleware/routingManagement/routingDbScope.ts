import { NextFunction, Request, Response } from "express";
import { runWithRoutingDb } from "../../models/routingManagement/routingDbContext.js";

// Gives the request its own SEPRoutingManagementDbContext (AddDbContext's scoped lifetime).
export function routingDbScope(_req: Request, _res: Response, next: NextFunction) {
  runWithRoutingDb(() => next());
}
