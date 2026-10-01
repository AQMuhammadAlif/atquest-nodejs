import { Request, Response } from "express";
import { created, ok } from "../utils/response.js";
import * as usersService from "../services/usersService.js";

export async function listUsers(_req: Request, res: Response) {
  ok(res, await usersService.list());
}

export async function createUser(req: Request, res: Response) {
  created(res, await usersService.create(req.body));
}
