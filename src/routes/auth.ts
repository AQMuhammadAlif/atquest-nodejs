import { Router } from "express";
import { login } from "../controllers/authController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
