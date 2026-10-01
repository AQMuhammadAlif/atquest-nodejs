import { Router } from "express";
import { createUser, listUsers } from "../controllers/usersController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, asyncHandler(listUsers));
// Creates real rbac.Users rows (with roles) in TNBESSDB, so it must not be anonymous.
usersRouter.post("/", requireAuth, asyncHandler(createUser));
