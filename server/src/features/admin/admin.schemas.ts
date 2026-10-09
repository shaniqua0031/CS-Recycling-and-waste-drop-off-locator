import { z } from "zod";

const reasonSchema = z.string().trim().min(5).max(500);

export const accountStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: reasonSchema,
}).strict();

export const approvalDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.reason) {
    context.addIssue({ code: "custom", message: "A reason is required when rejecting.", path: ["reason"] });
  }
});

export const assignmentSchema = z.object({
  collectorProfileId: z.string().min(1).max(100),
}).strict();

export const requestCancellationSchema = z.object({
  reason: reasonSchema,
}).strict();

export const incidentPriorityOverrideSchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  reason: reasonSchema,
}).strict();

export const incidentAssignmentSchema = z.object({
  collectorProfileId: z.string().trim().min(1).max(100),
}).strict();

export const incidentResolutionSchema = z.object({
  status: z.enum(["RESOLVED", "REOPENED"]),
  reason: reasonSchema,
}).strict();

export const maintenanceWindowSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  gracePeriodMinutes: z.number().int().min(0).max(1440).default(15),
}).strict().refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
  message: "Maintenance must end after it starts.",
  path: ["endsAt"],
});

export const maintenanceOverrunSchema = z.object({ enabled: z.boolean() }).strict();

export const sensorEventSchema = z.object({
  facilityId: z.string().trim().min(1).max(100),
  reading: z.number().finite().min(0).max(1_000_000),
}).strict();

export const sensorResetSchema = z.object({ facilityId: z.string().trim().min(1).max(100) }).strict();

export const simulatorActionSchema = z.object({
  action: z.enum([
    "INDIVIDUAL_PICKUP_REQUEST", "BIN_FULL", "COMPLETE_COLLECTION", "RECORD_WEIGHT",
    "ZONE_OVERFLOW", "FACILITY_STORAGE_FULL", "CREATE_COMMUNITY_REPORT", "CREATE_DUPLICATE_REPORT",
    "COLLECTOR_OFFLINE", "COLLECTOR_ACCEPT", "COLLECTOR_DECLINE", "DRIVE_COLLECTOR_TO_SITE",
    "FACILITY_FULL", "FACILITY_MAINTENANCE", "FACILITY_RECOVERED", "START_SERVICE_PAUSE", "ENABLE_OVERRUN",
    "TRIGGER_SENSOR_SPIKE", "RESET_SENSOR", "SEED_DEMO_DATA", "RESET_SIMULATION",
  ]),
  facilityId: z.string().trim().min(1).max(100).optional(),
  collectorProfileId: z.string().trim().min(1).max(100).optional(),
  requestId: z.string().trim().min(1).max(100).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  gracePeriodMinutes: z.number().int().min(0).max(1440).optional(),
  actualKg: z.number().positive().max(100000).optional(),
}).strict().superRefine((input, context) => {
  const requestActions = ["COMPLETE_COLLECTION", "RECORD_WEIGHT", "COLLECTOR_ACCEPT", "COLLECTOR_DECLINE", "DRIVE_COLLECTOR_TO_SITE"];
  const facilityActions = ["INDIVIDUAL_PICKUP_REQUEST", "BIN_FULL", "ZONE_OVERFLOW", "FACILITY_STORAGE_FULL", "CREATE_COMMUNITY_REPORT", "CREATE_DUPLICATE_REPORT", "FACILITY_FULL", "FACILITY_MAINTENANCE", "FACILITY_RECOVERED", "START_SERVICE_PAUSE", "ENABLE_OVERRUN", "TRIGGER_SENSOR_SPIKE", "RESET_SENSOR"];
  if (requestActions.includes(input.action) && !input.requestId) context.addIssue({ code: "custom", message: "Select a collection request.", path: ["requestId"] });
  if (facilityActions.includes(input.action) && !input.facilityId) context.addIssue({ code: "custom", message: "Select a facility.", path: ["facilityId"] });
  if (input.action === "COLLECTOR_OFFLINE" && !input.collectorProfileId) context.addIssue({ code: "custom", message: "Select a collector.", path: ["collectorProfileId"] });
  if (input.action === "RECORD_WEIGHT" && input.actualKg === undefined) context.addIssue({ code: "custom", message: "Enter the collected weight.", path: ["actualKg"] });
  if ((input.startsAt === undefined) !== (input.endsAt === undefined)) context.addIssue({ code: "custom", message: "Provide both maintenance timestamps or neither.", path: ["startsAt"] });
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) context.addIssue({ code: "custom", message: "Maintenance must end after it starts.", path: ["endsAt"] });
});

export const collectorMessageSchema = z.object({
  message: z.string().trim().min(1).max(1000),
}).strict();

export const materialRateSchema = z.object({
  pointsPerKg: z.number().int().min(0).max(10000),
  startsAt: z.string().datetime().optional(),
}).strict();

export const redemptionDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "FULFILLED"]),
  reason: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "REJECTED" && !value.reason) {
    context.addIssue({ code: "custom", message: "A reason is required when rejecting.", path: ["reason"] });
  }
});

export const reportStatusSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED"]),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const notificationReadSchema = z.object({
  read: z.boolean(),
}).strict();