import { Request, Response } from "express";
import { ok } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function login(req: Request, res: Response) {
  ok(res, await authService.login(req.body));
}
