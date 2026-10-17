import cors from "cors";
import express from "express";
import helmet from "helmet";
import { join } from "node:path";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { callsRouter } from "./routes/calls.js";
import { healthRouter } from "./routes/health.js";
import { patientsRouter } from "./routes/patients.js";
import { vapiRouter } from "./routes/vapi.js";

export function createApp() {
  const app = express();
  const dashboardPath = join(process.cwd(), "public", "dashboard");

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: "100kb" }));
  app.get("/dashboard", (_request, response) => response.sendFile(join(dashboardPath, "index.html")));
  app.use("/dashboard", express.static(dashboardPath, { index: false }));
  app.use(healthRouter);
  app.use(patientsRouter);
  app.use(callsRouter);
  app.use(vapiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
