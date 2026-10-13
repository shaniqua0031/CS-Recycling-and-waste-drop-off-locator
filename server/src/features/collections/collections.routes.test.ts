import assert from "node:assert/strict";
import test from "node:test";
import { AssignmentStatus, CollectionStatus } from "@prisma/client";

import { collectorHasResponded, requestIsVisibleToCollector } from "./collections.routes";

test("pending requests stay visible until a collector accepts, but are hidden from the collector who already declined", () => {
  const pendingRequest = {
    status: CollectionStatus.PENDING,
    assignments: [{ collectorProfileId: "collector-b", status: AssignmentStatus.DECLINED }],
  };

  assert.equal(requestIsVisibleToCollector(CollectionStatus.PENDING, "collector-a", []), true);
  assert.equal(requestIsVisibleToCollector(CollectionStatus.PENDING, "collector-a", [{ collectorProfileId: "collector-b", status: AssignmentStatus.ACCEPTED }]), false);
  assert.equal(requestIsVisibleToCollector(CollectionStatus.PENDING, "collector-a", [{ collectorProfileId: "collector-a", status: AssignmentStatus.DECLINED }]), false);
  assert.equal(requestIsVisibleToCollector(pendingRequest.status, "collector-a", pendingRequest.assignments), true);
});

test("collector responses are deduplicated per request", () => {
  const assignments = [
    { collectorProfileId: "collector-a", status: AssignmentStatus.DECLINED },
    { collectorProfileId: "collector-a", status: AssignmentStatus.ACCEPTED },
  ];

  assert.equal(collectorHasResponded("collector-a", assignments), true);
  assert.equal(collectorHasResponded("collector-b", assignments), false);
});
