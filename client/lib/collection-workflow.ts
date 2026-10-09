export type WorkflowCollectionStatus = "Pending" | "Assigned" | "On the way" | "Arrived" | "Collecting" | "Paused" | "Collected" | "Verified" | "Cancelled" | "Rejected";

export function toWorkflowStatus(apiStatus: string): WorkflowCollectionStatus {
  switch (apiStatus) {
    case "VERIFIED":
    case "COMPLETED":
      return "Verified";
    case "COLLECTING":
      return "Collecting";
    case "PAUSED":
      return "Paused";
    case "COLLECTOR_ARRIVED":
      return "Arrived";
    case "COLLECTOR_ON_THE_WAY":
      return "On the way";
    case "COLLECTED":
    case "VERIFICATION_PENDING":
      return "Collected";
    case "WAITING_FOR_ADMIN":
    case "PENDING":
      return "Pending";
    case "CANCELLED":
      return "Cancelled";
    case "REJECTED":
      return "Rejected";
    default:
      return "Assigned";
  }
}

export function buildDirectionsUrl(destination: string, origin?: { latitude: number; longitude: number }) {
  const searchParams = new URLSearchParams({ api: "1", destination });
  if (origin) {
    searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  }
  return `https://www.google.com/maps/dir/?${searchParams.toString()}`;
}
