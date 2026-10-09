import test from "node:test";
import assert from "node:assert/strict";

import { buildDirectionsUrl, toWorkflowStatus } from "./collection-workflow";

test("converts assignment statuses to the user-facing workflow state", () => {
  assert.equal(toWorkflowStatus("WAITING_FOR_ADMIN"), "Pending");
  assert.equal(toWorkflowStatus("COLLECTOR_ASSIGNED"), "Assigned");
  assert.equal(toWorkflowStatus("COLLECTOR_ON_THE_WAY"), "On the way");
  assert.equal(toWorkflowStatus("COLLECTOR_ARRIVED"), "Arrived");
  assert.equal(toWorkflowStatus("COLLECTING"), "Collecting");
  assert.equal(toWorkflowStatus("PAUSED"), "Paused");
  assert.equal(toWorkflowStatus("VERIFIED"), "Verified");
});

test("builds Google Maps directions for the assigned pickup address", () => {
  const url = new URL(buildDirectionsUrl("12 Main Road, Johannesburg"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("destination"), "12 Main Road, Johannesburg");
});
