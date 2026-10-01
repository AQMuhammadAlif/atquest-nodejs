import { Router } from "express";
import { createUser, listUsers } from "../controllers/usersController.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, asyncHandler(listUsers));
usersRouter.post("/", asyncHandler(createUser));
