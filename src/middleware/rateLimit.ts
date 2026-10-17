import { rateLimit } from "express-rate-limit";

export const patientsRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      data: null,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly",
      },
    });
  },
});
