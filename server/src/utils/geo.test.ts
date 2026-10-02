import assert from "node:assert/strict";
import test from "node:test";
import { distanceBetweenKm } from "./geo";

test("distanceBetweenKm returns zero for identical coordinates", () => {
  assert.equal(distanceBetweenKm({ latitude: -26.2041, longitude: 28.0473 }, { latitude: -26.2041, longitude: 28.0473 }), 0);
});

test("distanceBetweenKm calculates Johannesburg to Pretoria distance", () => {
  const distance = distanceBetweenKm(
    { latitude: -26.2041, longitude: 28.0473 },
    { latitude: -25.7479, longitude: 28.2293 },
  );

  assert.ok(distance > 50 && distance < 60, `Expected about 55 km, received ${distance} km`);
});

test("distanceBetweenKm rejects coordinates outside geographic bounds", () => {
  assert.throws(() => distanceBetweenKm({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }), RangeError);
  assert.throws(() => distanceBetweenKm({ latitude: 0, longitude: 181 }, { latitude: 0, longitude: 0 }), RangeError);
});
