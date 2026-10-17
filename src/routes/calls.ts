import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { listCalls } from "../services/callLogService.js";

export const callsRouter = Router();

callsRouter.get(
  "/calls",
  asyncHandler(async (request, response) => {
    const rawLimit = typeof request.query.limit === "string" ? Number(request.query.limit) : 100;
    const limit = Number.isInteger(rawLimit) ? rawLimit : 100;
    response.status(200).json({ data: await listCalls(limit), error: null });
  }),
);
