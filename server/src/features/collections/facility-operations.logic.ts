export type FacilityCapacityLevel = "UNCONFIGURED" | "NORMAL" | "NEAR_CAPACITY" | "CRITICAL";
export type FacilityStatus = "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED" | "NEAR_CAPACITY" | "FULL";

export function getFacilityCapacityLevel(currentKg: number, capacityKg: number | null): FacilityCapacityLevel {
  if (capacityKg === null || !Number.isFinite(capacityKg) || capacityKg <= 0 || !Number.isFinite(currentKg) || currentKg < 0) {
    return "UNCONFIGURED";
  }
  const percentage = currentKg / capacityKg * 100;
  if (percentage >= 95) return "CRITICAL";
  if (percentage >= 80) return "NEAR_CAPACITY";
  return "NORMAL";
}

export function statusForCapacity(currentStatus: FacilityStatus, maximumPercentage: number): FacilityStatus {
  if (currentStatus === "CLOSED" || currentStatus === "TEMPORARILY_CLOSED") return currentStatus;
  if (maximumPercentage >= 95) return "FULL";
  if (maximumPercentage >= 80) return "NEAR_CAPACITY";
  return "OPEN";
}