import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { checkHealth } from "../services/healthService.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_request, response) => {
    const health = await checkHealth();
    response.status(200).json({ data: health, error: null });
  }),
);
