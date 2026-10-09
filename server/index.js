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
const bufferedEventsPath = useCompiledOutput
  ? "./dist/features/collections/buffered-events"
  : "./src/features/collections/buffered-events";
const { activateDueCollectionEvents } = require(bufferedEventsPath);
const maintenanceEventsPath = useCompiledOutput
  ? "./dist/features/admin/maintenance-events"
  : "./src/features/admin/maintenance-events";
const { processFacilityMaintenance } = require(maintenanceEventsPath);

const server = app.listen(env.PORT, () => {
  console.log(`WasteWise API listening on port ${env.PORT}`);
});

let isProcessingBufferedEvents = false;
const processBufferedEvents = () => {
  if (isProcessingBufferedEvents) return;
  isProcessingBufferedEvents = true;
  void Promise.all([activateDueCollectionEvents(), processFacilityMaintenance()])
    .catch((error) => console.error("Could not process scheduled collection and facility events.", error))
    .finally(() => { isProcessingBufferedEvents = false; });
};
processBufferedEvents();
const bufferedEventsTimer = setInterval(processBufferedEvents, 2000);
bufferedEventsTimer.unref();

function shutdown(signal) {
  console.log(`${signal} received; closing the HTTP server.`);
  clearInterval(bufferedEventsTimer);
  server.close((error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));