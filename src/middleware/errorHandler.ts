import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    data: null,
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${request.method} ${request.path}`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      data: null,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
    response.status(400).json({
      data: null,
      error: { code: "MALFORMED_JSON", message: "Request body is not valid JSON" },
    });
    return;
  }

  logger.error("unhandled_error", { error });
  response.status(500).json({
    data: null,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
