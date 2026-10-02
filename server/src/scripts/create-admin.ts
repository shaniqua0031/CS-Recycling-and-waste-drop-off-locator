import "dotenv/config";
import bcrypt from "bcryptjs";
import { AccountStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the server environment.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL must be a valid email address.");
  if (password.length < 12 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must contain 12 to 128 characters and no more than 72 UTF-8 bytes.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existingUser && existingUser.role !== UserRole.ADMIN) {
    throw new Error("Refusing to promote an existing non-Admin account. Use a dedicated Admin email.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: UserRole.ADMIN, status: AccountStatus.ACTIVE },
    create: { email, passwordHash, role: UserRole.ADMIN, status: AccountStatus.ACTIVE },
  });
  console.log("Admin account provisioned.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed to provision Admin account.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());