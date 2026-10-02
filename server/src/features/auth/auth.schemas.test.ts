import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema, registerSchema } from "./auth.schemas";

test("registration normalizes email and accepts valid roles while rejecting ADMIN", () => {
  const result = registerSchema.safeParse({
    displayName: "  Recycle User  ",
    email: "  USER@example.com ",
    password: "recycle-password-123",
    role: "COLLECTOR",
    serviceArea: "Johannesburg North",
    serviceRadiusKm: 25,
    serviceCenterLatitude: -26.1,
    serviceCenterLongitude: 28.0,
    vehicleType: "Van",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.displayName, "Recycle User");
    assert.equal(result.data.email, "user@example.com");
    assert.equal(result.data.role, "COLLECTOR");
  }

  assert.equal(registerSchema.safeParse({
    displayName: "Recycle User",
    email: "user@example.com",
    password: "recycle-password-123",
    role: "ADMIN",
  }).success, false);

  assert.equal(registerSchema.safeParse({
    displayName: "Waste Facility",
    email: "facility@example.com",
    password: "recycle-password-123",
    role: "FACILITY",
    facilityName: "Waste Facility",
    facilityAddress: "1 Recycle Road, Johannesburg",
    facilityLatitude: -26.2,
    facilityLongitude: 28.0,
    acceptedMaterials: ["Plastic"],
    openingHours: ["08:00-17:00", "", "", "", "", "", "Closed"],
  }).success, true);

  assert.equal(registerSchema.safeParse({
    displayName: "Incomplete Collector",
    email: "incomplete@example.com",
    password: "recycle-password-123",
    role: "COLLECTOR",
  }).success, false);
});

test("registration requires a strong password and valid email", () => {
  assert.equal(registerSchema.safeParse({ displayName: "User", email: "not-email", password: "short" }).success, false);
});

test("login normalizes email while allowing previously established password rules", () => {
  const result = loginSchema.safeParse({ email: "USER@example.com", password: "any-existing-password" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "user@example.com");
});
