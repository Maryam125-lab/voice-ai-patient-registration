import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { vapiAuth } from "../middleware/vapiAuth.js";
import { handleEndOfCallReport, handleToolCalls } from "../services/vapiService.js";

export const vapiRouter = Router();

vapiRouter.post(
  "/vapi/webhook",
  vapiAuth,
  asyncHandler(async (request, response) => {
    const body = request.body as Record<string, unknown>;
    const message = body.message;
    const type = message && typeof message === "object" && "type" in message
      ? (message as { type?: unknown }).type
      : undefined;

    if (type === "tool-calls") {
      response.status(200).json({ results: await handleToolCalls(body) });
      return;
    }
    if (type === "end-of-call-report") {
      await handleEndOfCallReport(body);
      response.status(200).json({});
      return;
    }
    response.status(200).json({});
  }),
);
