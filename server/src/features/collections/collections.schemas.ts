import { z } from "zod";

export const collectionRequestSchema = z.object({
  material: z.string().trim().min(1).max(80),
  destinationFacilityId: z.string().min(1).max(100),
  estimatedKg: z.number().positive().max(100000),
  requestedFor: z.string().datetime(),
  pickupAddress: z.string().trim().min(5).max(300),
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const bufferedCollectionEventSchema = collectionRequestSchema.extend({
  idempotencyKey: z.string().trim().min(12).max(120),
}).strict();

export const facilitySearchSchema = z.object({
  query: z.string().trim().max(120).optional(),
  material: z.string().trim().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  maxDistanceKm: z.coerce.number().positive().max(500).optional(),
  openNow: z.enum(["true", "false"]).optional(),
}).strict().superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "Provide both latitude and longitude for distance search." });
  }
});

export const collectedWeightSchema = z.object({
  actualKg: z.number().positive().max(100000).optional(),
  materials: z.array(z.object({
    materialId: z.string().trim().min(1).max(100),
    actualKg: z.number().min(0).max(100000),
  }).strict()).min(1).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict().superRefine((input, context) => {
  if ((input.actualKg === undefined) === (input.materials === undefined)) {
    context.addIssue({ code: "custom", message: "Provide either a total weight or material weights." });
  }
  if (input.materials) {
    if (new Set(input.materials.map((item) => item.materialId)).size !== input.materials.length) {
      context.addIssue({ code: "custom", message: "Each material can only be recorded once.", path: ["materials"] });
    }
    if (input.materials.reduce((total, item) => total + item.actualKg, 0) <= 0) {
      context.addIssue({ code: "custom", message: "The total collected weight must be greater than zero.", path: ["materials"] });
    }
  }
});

export const collectorDeclineSchema = z.object({
  reasonCode: z.enum(["VEHICLE_FULL", "TOO_FAR", "UNAVAILABLE", "MATERIAL_UNSUPPORTED", "SAFETY_ISSUE", "OTHER"]),
  explanation: z.string().trim().min(1).max(500).optional(),
}).strict();

export const collectorProgressSchema = z.object({
  action: z.enum(["ARRIVED", "START", "PAUSE", "RESUME"]),
  delayCode: z.enum(["VEHICLE_PROBLEM", "SAFETY_ISSUE", "SORTING_DELAY", "CUSTOMER_DELAY", "OTHER"]).optional(),
  explanation: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((input, context) => {
  if (input.action === "PAUSE" && !input.delayCode) {
    context.addIssue({ code: "custom", message: "A delay reason is required when pausing a collection.", path: ["delayCode"] });
  }
  if (input.action !== "PAUSE" && (input.delayCode || input.explanation)) {
    context.addIssue({ code: "custom", message: "Delay details are only accepted when pausing a collection." });
  }
});

export const collectorAvailabilitySchema = z.object({
  availability: z.enum(["AVAILABLE", "ON_COLLECTION", "OFFLINE", "UNAVAILABLE"]).optional(),
  qualifiedMaterialIds: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict().refine((input) => input.availability !== undefined || input.qualifiedMaterialIds !== undefined, {
  message: "Update availability or qualified materials.",
});

export const collectionPrioritySchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  reason: z.string().trim().min(5).max(500),
}).strict();

export const rewardRedemptionSchema = z.object({
  pointsCost: z.number().int().min(1).max(100000),
}).strict();

export const rewardOptionRedemptionSchema = z.object({
  rewardId: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(12).max(120),
}).strict();

export const electricityRedemptionSchema = rewardRedemptionSchema.extend({
  meterNumber: z.string().trim().min(6).max(32).regex(/^[A-Za-z0-9-]+$/),
}).strict();

export const verifiedWeightSchema = z.object({
  verifiedKg: z.number().positive().max(100000).optional(),
  materials: z.array(z.object({
    materialId: z.string().trim().min(1).max(100),
    verifiedKg: z.number().min(0).max(100000),
  }).strict()).min(1).max(20).optional(),
}).strict().superRefine((input, context) => {
  if ((input.verifiedKg === undefined) === (input.materials === undefined)) {
    context.addIssue({ code: "custom", message: "Provide either a total verified weight or material weights." });
  }
  if (input.materials) {
    if (new Set(input.materials.map((item) => item.materialId)).size !== input.materials.length) {
      context.addIssue({ code: "custom", message: "Each material can only be verified once.", path: ["materials"] });
    }
    if (input.materials.reduce((total, item) => total + item.verifiedKg, 0) <= 0) {
      context.addIssue({ code: "custom", message: "The total verified weight must be greater than zero.", path: ["materials"] });
    }
  }
});

export const collectorLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();

export const facilityProfileSchema = z.object({
  facilityId: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  website: z.string().trim().url().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  acceptedMaterials: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  openingHours: z.array(z.string().trim().regex(/^(?:|closed|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/i)).length(7),
}).strict().superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "Provide both latitude and longitude.", path: ["latitude"] });
  }
  if (!input.openingHours.some((hours) => hours.length > 0)) {
    context.addIssue({ code: "custom", message: "Add opening hours for at least one day.", path: ["openingHours"] });
  }
  input.openingHours.forEach((hours, dayOfWeek) => {
    if (!hours || /^closed$/i.test(hours)) return;
    const [opensAt, closesAt] = hours.split("-");
    if (opensAt >= closesAt) context.addIssue({ code: "custom", message: "Closing time must be later than opening time.", path: ["openingHours", dayOfWeek] });
  });
});

export const facilityDashboardQuerySchema = z.object({
  facilityId: z.string().trim().min(1).max(100).optional(),
}).strict();

export const facilityStatusSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  status: z.enum(["OPEN", "CLOSED", "TEMPORARILY_CLOSED"]),
}).strict();

export const facilityCapacitySchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  materials: z.array(z.object({
    materialId: z.string().trim().min(1).max(100),
    capacityKg: z.number().positive().max(100000000).nullable(),
    currentKg: z.number().min(0).max(100000000),
  }).strict()).min(1).max(20),
}).strict().superRefine((input, context) => {
  if (new Set(input.materials.map((item) => item.materialId)).size !== input.materials.length) {
    context.addIssue({ code: "custom", message: "Each material can only be configured once.", path: ["materials"] });
  }
});

export const facilityIncidentSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  type: z.enum(["EQUIPMENT_ISSUE", "CAPACITY_PROBLEM", "COLLECTION_PROBLEM", "SAFETY_ISSUE", "INCORRECT_MATERIAL", "OTHER"]),
  description: z.string().trim().min(10).max(3000),
}).strict();

export const reportSubmissionSchema = z.object({
  type: z.enum(["INCORRECT_INFORMATION", "SUGGEST_NEW_FACILITY", "COLLECTOR_PROBLEM", "COLLECTION_PROBLEM", "OVERFLOWING_BIN", "OVERFLOWING_DROP_OFF", "FACILITY_FULL", "FACILITY_CLOSED", "INCORRECT_OPENING_HOURS", "ILLEGAL_DUMPING", "BROKEN_GLASS", "HAZARDOUS_WASTE", "SAFETY_ISSUE", "OTHER"]),
  description: z.string().trim().min(10).max(3000),
  facilityId: z.string().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  suggestedName: z.string().trim().min(2).max(120).optional(),
  suggestedAddress: z.string().trim().min(5).max(300).optional(),
  suggestedLatitude: z.number().min(-90).max(90).optional(),
  suggestedLongitude: z.number().min(-180).max(180).optional(),
  suggestedAcceptedMaterials: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).strict().superRefine((input, context) => {
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    context.addIssue({ code: "custom", message: "Provide both coordinates or neither.", path: ["latitude"] });
  }
  if (input.type === "SUGGEST_NEW_FACILITY") {
    for (const field of ["suggestedName", "suggestedAddress", "suggestedLatitude", "suggestedLongitude"] as const) {
      if (input[field] === undefined) context.addIssue({ code: "custom", message: `${field} is required for a new facility suggestion.`, path: [field] });
    }
    if (!input.suggestedAcceptedMaterials?.length) context.addIssue({ code: "custom", message: "Select at least one accepted material.", path: ["suggestedAcceptedMaterials"] });
  }
  if (input.type === "INCORRECT_INFORMATION" && !input.facilityId && (!input.suggestedName || !input.suggestedAddress)) {
    context.addIssue({ code: "custom", message: "Identify an existing facility or provide its name and address.", path: ["facilityId"] });
  }
  if (["OVERFLOWING_BIN", "OVERFLOWING_DROP_OFF", "FACILITY_FULL", "FACILITY_CLOSED", "INCORRECT_OPENING_HOURS", "ILLEGAL_DUMPING", "BROKEN_GLASS", "HAZARDOUS_WASTE", "SAFETY_ISSUE", "COLLECTOR_PROBLEM", "COLLECTION_PROBLEM"].includes(input.type) && !input.facilityId && input.latitude === undefined) {
    context.addIssue({ code: "custom", message: "Provide a facility or issue location.", path: ["facilityId"] });
  }
});

export const collectionCancellationSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const facilityReceiveSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  receivedKg: z.number().positive().max(100000),
  condition: z.enum(["ACCEPTABLE", "CONTAMINATED", "WRONG_MATERIAL", "DAMAGED", "OTHER"]),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const facilityRejectSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  reasonCode: z.enum(["WRONG_MATERIAL", "CONTAMINATED", "FACILITY_FULL", "UNSUPPORTED_MATERIAL", "OTHER"]),
  notes: z.string().trim().min(1).max(1000).optional(),
}).strict();