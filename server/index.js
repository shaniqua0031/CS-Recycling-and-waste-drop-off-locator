const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const useCompiledOutput = process.argv.includes("--compiled");

if (!useCompiledOutput) {
  require("tsx/cjs");
}

const appPath = useCompiledOutput ? "./dist/app" : "./src/app";
const envPath = useCompiledOutput ? "./dist/config/env" : "./src/config/env";
const { env } = require(envPath);

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before starting the API.");
}

const { app } = require(appPath);

const server = app.listen(env.PORT, () => {
  console.log(`WasteWise API listening on port ${env.PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing the HTTP server.`);
  server.close((error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));