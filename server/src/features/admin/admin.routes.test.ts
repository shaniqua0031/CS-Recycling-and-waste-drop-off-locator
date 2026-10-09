import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../../app";

test("Admin operations endpoints reject requests without an authenticated Admin session", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    for (const path of [
      "/api/v1/admin/overview",
      "/api/v1/admin/incidents",
      "/api/v1/admin/incidents/incident-1/priority",
      "/api/v1/admin/incidents/incident-1/assignment",
      "/api/v1/admin/incidents/incident-1/status",
      "/api/v1/admin/maintenance-windows",
      "/api/v1/admin/sensors",
      "/api/v1/admin/simulator/events",
      "/api/v1/admin/simulator/actions",
    ]) {
      const apiResponse: Response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: path.includes("/priority") || path.includes("/assignment") || path.endsWith("/status") ? "PATCH" : path.endsWith("/actions") ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: path.includes("/priority") ? JSON.stringify({ priority: "CRITICAL", reason: "Safety hazard" }) : path.endsWith("/actions") ? JSON.stringify({ action: "RESET_SIMULATION" }) : undefined,
      });
      assert.equal(apiResponse.status, 401, path);
      const body = await apiResponse.json() as { error: { code: string } };
      assert.equal(body.error.code, "UNAUTHENTICATED", path);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});