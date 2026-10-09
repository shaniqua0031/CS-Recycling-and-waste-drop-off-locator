import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "./app";
import { getSessionCookieOptions } from "./features/auth/auth.security";

test("health endpoint returns the versioned API envelope", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { status: "ok" } });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("unknown API routes return the shared error envelope", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "NOT_FOUND", message: "The requested API route was not found." },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("Vercel frontend origin is allowed for credentialed auth requests", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = "https://cs-recycling-and-waste-drop-off-loc.vercel.app";

  try {
    const preflight = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/logout`, {
      method: "POST",
      headers: { origin },
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("ReLoop Vercel production and preview origins are allowed for credentialed requests", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origins = [
    "https://cs-recycling-and-waste-drop-off-locator.vercel.app",
    "https://cs-recycling-and-waste-drop-off-locator-jclyuxq6y.vercel.app",
    "https://cs-recycling-and-waste-drop-off-locator-feature-branch.vercel.app",
  ];

  try {
    for (const origin of origins) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type,authorization",
        },
      });
      assert.equal(response.status, 204, origin);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      assert.match(response.headers.get("access-control-allow-headers") ?? "", /Content-Type/i);
      assert.match(response.headers.get("access-control-allow-headers") ?? "", /Authorization/i);
      assert.match(response.headers.get("access-control-allow-methods") ?? "", /OPTIONS/);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("unrelated Vercel origins do not receive credentialed CORS headers", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`, {
      method: "OPTIONS",
      headers: { origin: "https://unrelated-project.vercel.app", "access-control-request-method": "GET" },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("alternate local Next.js dev port is allowed for credentialed requests", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = "http://localhost:3001";

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "GET" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("registration rejects a client-supplied privileged role before database access", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        displayName: "Recycler User",
        email: "recycler@example.com",
        password: "recycle-password-123",
        role: "ADMIN",
      }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "VALIDATION_ERROR");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("auth routes reject untrusted browser origins", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/logout`, {
      method: "POST",
      headers: { origin: "https://untrusted.example" },
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "UNTRUSTED_ORIGIN");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("session endpoint requires authentication", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`);
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "UNAUTHENTICATED");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("production cookies use secure cross-site settings", () => {
  const cookieOptions = getSessionCookieOptions({ isProduction: true, maxAge: 60_000 });

  assert.equal(cookieOptions.secure, true);
  assert.equal(cookieOptions.sameSite, "none");
  assert.equal(cookieOptions.path, "/");
  assert.equal(cookieOptions.maxAge, 60_000);
});

test("registration and login succeed with session cookie", async () => {
  const email = `sharon-${randomUUID()}@example.com`;
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const regRes = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        displayName: "Sharon",
        email,
        password: "securepassword123",
      }),
    });

    assert.equal(regRes.status, 201);
    const regBody = await regRes.json() as { data: { user: { email: string; displayName: string } } };
    assert.equal(regBody.data.user.email, email);
    assert.equal(regBody.data.user.displayName, "Sharon");

    const cookieHeader = regRes.headers.get("set-cookie");
    assert.ok(cookieHeader);

    const sessionRes = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/session`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json() as { data: { authenticated: boolean; user: { email: string } } };
    assert.equal(sessionBody.data.authenticated, true);
    assert.equal(sessionBody.data.user.email, email);

    const loginRes = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        email,
        password: "securepassword123",
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json() as { data: { user: { email: string } } };
    assert.equal(loginBody.data.user.email, email);

    const roleBoundaryRequests = [
      fetch(`http://127.0.0.1:${address.port}/api/v1/admin/audit`, { headers: { cookie: cookieHeader } }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/location`, {
        method: "PUT",
        headers: { cookie: cookieHeader, "content-type": "application/json" },
        body: JSON.stringify({ latitude: -26.2, longitude: 28 }),
      }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/facility-profile`, { headers: { cookie: cookieHeader } }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/facility/dashboard`, { headers: { cookie: cookieHeader } }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/facility/notifications?facilityId=facility-1`, { headers: { cookie: cookieHeader } }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/facility/incidents`, {
        method: "POST",
        headers: { cookie: cookieHeader, "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ facilityId: "facility-1", type: "EQUIPMENT_ISSUE", description: "The sorting conveyor belt has stopped working." }),
      }),
      fetch(`http://127.0.0.1:${address.port}/api/v1/collections/facility/status`, {
        method: "PATCH",
        headers: { cookie: cookieHeader, "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ facilityId: "facility-1", status: "OPEN" }),
      }),
    ];
    const roleBoundaryResponses = await Promise.all(roleBoundaryRequests);
    assert.deepEqual(roleBoundaryResponses.map((response) => response.status), [403, 403, 403, 403, 403, 403, 403]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
