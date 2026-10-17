import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "../config.js";
import { logger } from "../logger.js";

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const vapiAuth: RequestHandler = (request, response, next) => {
  const secret = request.get("X-Vapi-Secret") ?? "";
  if (!secretsMatch(secret, config.vapiWebhookSecret)) {
    logger.warn("vapi_auth_failed", { ip: request.ip });
    response.status(401).json({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Invalid Vapi webhook secret" },
    });
    return;
  }
  next();
};
