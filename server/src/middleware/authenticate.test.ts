import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { requireRoles } from "./authenticate";

test("requireRoles blocks missing identities and roles outside the allowlist", async () => {
  const middleware = requireRoles(UserRole.ADMIN);
  const missingIdentity = await new Promise<unknown>((resolve) => {
    middleware({ auth: undefined } as never, {} as never, resolve);
  });
  assert.equal((missingIdentity as { code?: string }).code, "UNAUTHENTICATED");

  const recyclerIdentity = await new Promise<unknown>((resolve) => {
    middleware({ auth: { role: UserRole.RECYCLER } } as never, {} as never, resolve);
  });
  assert.equal((recyclerIdentity as { code?: string }).code, "FORBIDDEN");

  await new Promise<void>((resolve, reject) => {
    middleware({ auth: { role: UserRole.ADMIN } } as never, {} as never, (error) => error ? reject(error) : resolve());
  });
});
