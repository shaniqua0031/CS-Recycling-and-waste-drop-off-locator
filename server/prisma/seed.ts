import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const initialRates = [
  { slug: "plastic", name: "Plastic", pointsPerKg: 10 },
  { slug: "paper", name: "Paper", pointsPerKg: 5 },
  { slug: "glass", name: "Glass", pointsPerKg: 8 },
  { slug: "metal", name: "Metal", pointsPerKg: 15 },
  { slug: "e-waste", name: "E-waste", pointsPerKg: 20 },
  { slug: "general-waste", name: "General Waste", pointsPerKg: 0 },
];
const initialRateStart = new Date("2026-01-01T00:00:00.000Z");

async function seedMaterials(): Promise<void> {
  for (const item of initialRates) {
    const material = await prisma.material.upsert({
      where: { slug: item.slug },
      update: { name: item.name, isActive: true },
      create: { slug: item.slug, name: item.name },
    });

    await prisma.materialRewardRate.upsert({
      where: {
        materialId_startsAt: {
          materialId: material.id,
          startsAt: initialRateStart,
        },
      },
      update: { pointsPerKg: item.pointsPerKg, endsAt: null },
      create: {
        materialId: material.id,
        pointsPerKg: item.pointsPerKg,
        startsAt: initialRateStart,
      },
    });
  }
}

seedMaterials()
  .then(() => console.log("Seeded supported materials and initial reward rates."))
  .catch((error: unknown) => {
    console.error("Failed to seed material data.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
