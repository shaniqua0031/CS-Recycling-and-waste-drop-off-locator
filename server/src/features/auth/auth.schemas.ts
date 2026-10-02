import { z } from "zod";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(12).max(128).refine(
  (password) => Buffer.byteLength(password, "utf8") <= 72,
  "Password must be at most 72 bytes.",
);

export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().min(7).max(32).optional(),
  role: z.enum(["RECYCLER", "COLLECTOR", "FACILITY"]).default("RECYCLER"),
  serviceArea: z.string().trim().min(2).max(120).optional(),
  serviceRadiusKm: z.number().positive().max(250).optional(),
  serviceCenterLatitude: z.number().min(-90).max(90).optional(),
  serviceCenterLongitude: z.number().min(-180).max(180).optional(),
  vehicleType: z.string().trim().min(2).max(80).optional(),
  vehicleDescription: z.string().trim().max(300).optional(),
  vehicleRegistration: z.string().trim().max(32).optional(),
  facilityName: z.string().trim().min(2).max(120).optional(),
  facilityAddress: z.string().trim().min(5).max(300).optional(),
  facilityLatitude: z.number().min(-90).max(90).optional(),
  facilityLongitude: z.number().min(-180).max(180).optional(),
  acceptedMaterials: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  openingHours: z.array(z.string().trim().regex(/^(?:|closed|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/i)).length(7).optional(),
}).strict().superRefine((input, context) => {
  if (input.role === "COLLECTOR") {
    for (const field of ["serviceArea", "serviceRadiusKm", "serviceCenterLatitude", "serviceCenterLongitude", "vehicleType"] as const) {
      if (input[field] === undefined) context.addIssue({ code: "custom", message: `${field} is required for collector registration.`, path: [field] });
    }
  }
  if (input.role === "FACILITY") {
    for (const field of ["facilityName", "facilityAddress"] as const) {
      if (input[field] === undefined) context.addIssue({ code: "custom", message: `${field} is required for facility registration.`, path: [field] });
    }
    if (!input.acceptedMaterials?.length) context.addIssue({ code: "custom", message: "Select at least one accepted material.", path: ["acceptedMaterials"] });
    if (!input.openingHours?.some((hours) => hours.length > 0)) context.addIssue({ code: "custom", message: "Add opening hours for at least one day.", path: ["openingHours"] });
  }
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must be at most 72 bytes.",
  ),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
