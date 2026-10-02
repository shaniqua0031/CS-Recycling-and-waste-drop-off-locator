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