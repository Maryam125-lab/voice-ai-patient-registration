import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const app = createApp();

// Vercel imports the Express app as a serverless handler. Local and container
// deployments still need an HTTP listener.
const server = process.env.VERCEL
  ? undefined
  : app.listen(config.port, () => {
      logger.info("server_started", { port: config.port, nodeEnv: config.nodeEnv });
    });

function shutdown(signal: string): void {
  logger.info("server_stopping", { signal });
  server?.close((error) => {
    if (error) {
      logger.error("server_shutdown_failed", { error });
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
