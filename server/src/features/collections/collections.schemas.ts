import { z } from "zod";

export const collectionRequestSchema = z.object({
  material: z.string().trim().min(1).max(80),
  destinationFacilityId: z.string().min(1).max(100),
  estimatedKg: z.number().positive().max(100000),
  requestedFor: z.string().datetime(),
  pickupAddress: z.string().trim().min(5).max(300),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
}).strict();

export const collectedWeightSchema = z.object({
  actualKg: z.number().positive().max(100000),
}).strict();

export const verifiedWeightSchema = z.object({
  verifiedKg: z.number().positive().max(100000),
}).strict();

export const collectorLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();

export const facilityProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  acceptedMaterials: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  openingHours: z.array(z.string().trim().regex(/^(?:|closed|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/i)).length(7),
}).strict().superRefine((input, context) => {
  if (!input.openingHours.some((hours) => hours.length > 0)) {
    context.addIssue({ code: "custom", message: "Add opening hours for at least one day.", path: ["openingHours"] });
  }
});

export const reportSubmissionSchema = z.object({
  type: z.enum(["INCORRECT_INFORMATION", "SUGGEST_NEW_FACILITY", "COLLECTOR_PROBLEM", "COLLECTION_PROBLEM", "OTHER"]),
  description: z.string().trim().min(10).max(3000),
  facilityId: z.string().min(1).max(100).optional(),
  suggestedName: z.string().trim().min(2).max(120).optional(),
  suggestedAddress: z.string().trim().min(5).max(300).optional(),
  suggestedLatitude: z.number().min(-90).max(90).optional(),
  suggestedLongitude: z.number().min(-180).max(180).optional(),
  suggestedAcceptedMaterials: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).strict().superRefine((input, context) => {
  if (input.type === "SUGGEST_NEW_FACILITY") {
    for (const field of ["suggestedName", "suggestedAddress", "suggestedLatitude", "suggestedLongitude"] as const) {
      if (input[field] === undefined) context.addIssue({ code: "custom", message: `${field} is required for a new facility suggestion.`, path: [field] });
    }
    if (!input.suggestedAcceptedMaterials?.length) context.addIssue({ code: "custom", message: "Select at least one accepted material.", path: ["suggestedAcceptedMaterials"] });
  }
  if (input.type === "INCORRECT_INFORMATION" && !input.facilityId && (!input.suggestedName || !input.suggestedAddress)) {
    context.addIssue({ code: "custom", message: "Identify an existing facility or provide its name and address.", path: ["facilityId"] });
  }
});