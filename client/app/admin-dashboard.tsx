"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  assignCollector,
  getAdminAudit,
  decideCollector,
  decideFacility,
  decideRedemption,
  getAdminActiveCollections,
  getAdminAnalytics,
  getAdminCollectors,
  getAdminFacilities,
  getAdminNotifications,
  getAdminOverview,
  getAdminRedemptions,
  getAdminReports,
  getAdminRequests,
  getAdminUsers,
  getCollectorCandidates,
  getAdminVerificationQueue,
  getMaterialRates,
  markAdminNotification,
  setAdminFacilityStatus,
  setAdminUserStatus,
  updateAdminReport,
  updateMaterialRate,
  type AdminAnalytics,
  type AdminAuditEntry,
  type AdminCollector,
  type AdminFacility,
  type AdminNotification,
  type AdminOverview,
  type AdminRedemption,
  type AdminReport,
  type AdminUser,
  type CollectionRecord,
  type CollectorCandidate,
  type MaterialRate,
} from "../lib/dashboard-api";

const ActiveCollectionsMap = dynamic(() => import("./admin-collections-map"), {
  ssr: false,
  loading: () => <div className="grid h-[360px] place-items-center bg-gray-100 text-sm text-gray-500">Loading collection map…</div>,
});
const AssignmentMap = dynamic(() => import("./admin-collections-map").then((module) => module.AdminAssignmentMap), {
  ssr: false,
  loading: () => <div className="mb-4 grid h-[280px] place-items-center bg-gray-100 text-sm text-gray-500">Loading collector map…</div>,
});

export type AdminSection = "overview" | "users" | "collectors" | "facilities" | "requests" | "active" | "verification" | "rewards" | "redemptions" | "analytics" | "reports" | "notifications" | "audit";

type AdminDashboardData = {
  overview: AdminOverview;
  users: AdminUser[];
  collectors: AdminCollector[];
  facilities: AdminFacility[];
  requests: CollectionRecord[];
  activeCollections: CollectionRecord[];
  verification: CollectionRecord[];
  rates: MaterialRate[];
  redemptions: AdminRedemption[];
  analytics: AdminAnalytics;
  reports: AdminReport[];
  notifications: AdminNotification[];
  audit: AdminAuditEntry[];
};

const navItems: { id: AdminSection; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "users", label: "Users", icon: "◎" },
  { id: "collectors", label: "Collectors", icon: "⇄" },
  { id: "facilities", label: "Facilities", icon: "⌂" },
  { id: "requests", label: "Collection requests", icon: "▤" },
  { id: "active", label: "Active collections", icon: "⌖" },
  { id: "verification", label: "Verification", icon: "✓" },
  { id: "rewards", label: "Rewards & rates", icon: "◇" },
  { id: "redemptions", label: "Redemptions", icon: "▣" },
  { id: "analytics", label: "Analytics", icon: "▥" },
  { id: "reports", label: "Reports", icon: "⚑" },
  { id: "notifications", label: "Notifications", icon: "◉" },
  { id: "audit", label: "Audit log", icon: "≡" },
];

async function loadAdminDashboardData(): Promise<AdminDashboardData> {
  const [overview, users, collectors, facilities, requests, activeCollections, verification, rates, redemptions, analytics, reports, notifications, audit] = await Promise.all([
    getAdminOverview(), getAdminUsers(), getAdminCollectors(), getAdminFacilities(), getAdminRequests(),
    getAdminActiveCollections(), getAdminVerificationQueue(), getMaterialRates(), getAdminRedemptions(),
    getAdminAnalytics(), getAdminReports(), getAdminNotifications(), getAdminAudit(),
  ]);
  return { overview, users, collectors, facilities, requests, activeCollections, verification, rates, redemptions, analytics, reports, notifications, audit };
}

function formatStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function RequestStatus({ status }: { status: string }) {
  const className = status === "COMPLETED" || status === "VERIFIED" || status === "APPROVED"
    ? "bg-emerald-100 text-emerald-800"
    : status === "REJECTED" || status === "CANCELLED" || status === "SUSPENDED"
      ? "bg-rose-100 text-rose-800"
      : status === "WAITING_FOR_ADMIN" || status === "PENDING" || status === "REQUESTED"
        ? "bg-amber-100 text-amber-900"
        : "bg-sky-100 text-sky-900";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{formatStatus(status)}</span>;
}

function DataTable({ children, headings }: { headings: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{headings.map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{children}</tbody></table></div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{children}</p>;
}

export default function AdminDashboard({ email, onLogout, initialSection = "overview" }: { email: string; onLogout: () => void; initialSection?: AdminSection }) {
  const [section, setSection] = useState<AdminSection>(initialSection);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [candidateRequestId, setCandidateRequestId] = useState("");
  const [candidates, setCandidates] = useState<CollectorCandidate[]>([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [openUserId, setOpenUserId] = useState("");
  const [openRequestId, setOpenRequestId] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("WAITING_FOR_ADMIN");
  const [requestSearch, setRequestSearch] = useState("");

  const refresh = async () => {
    setIsLoading(true);
    try {
      setData(await loadAdminDashboardData());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Admin dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadAdminDashboardData()
      .then((loadedData) => {
        if (!active) return;
        setData(loadedData);
        setError("");
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load Admin dashboard data.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const mutate = async (action: () => Promise<unknown>) => {
    setIsWorking(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Admin action could not be completed.");
    } finally {
      setIsWorking(false);
    }
  };

  const askReason = (message: string, required = true): string | null => {
    const reason = window.prompt(message)?.trim() ?? "";
    if (!reason && required) {
      setError("A reason is required for this Admin action.");
      return null;
    }
    return reason || null;
  };

  const openCandidates = async (requestId: string) => {
    setCandidateRequestId(requestId);
    setCandidates([]);
    try {
      setCandidates(await getCollectorCandidates(requestId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load eligible collectors.");
    }
  };

  const title = navItems.find((item) => item.id === section)?.label ?? "Overview";
  const filteredUsers = data?.users.filter((user) => `${user.displayName} ${user.email} ${user.role}`.toLowerCase().includes(userSearch.toLowerCase())) ?? [];
  const visibleRequests = (data?.requests ?? []).filter((request) => {
    const matchesStatus = requestStatusFilter === "ALL" || request.status === requestStatusFilter;
    const haystack = `${request.id} ${request.requester?.recyclerProfile?.displayName ?? ""} ${request.requester?.email ?? ""} ${request.pickupAddress} ${request.material.name}`.toLowerCase();
    return matchesStatus && haystack.includes(requestSearch.toLowerCase());
  });

  return (
    <main className="min-h-[calc(100vh-58px)] bg-[#f4f7f4] pb-8 text-gray-900">
      <div className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">WasteWise / Administration</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold text-gray-950">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:inline">{email}</span>
            <button type="button" onClick={() => void refresh()} disabled={isLoading || isWorking} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">Refresh</button>
            <button type="button" onClick={onLogout} className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">Sign out</button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Admin sections" className="grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-3 lg:sticky lg:top-20 lg:flex lg:h-fit lg:flex-col">
            {navItems.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold transition-colors sm:text-sm ${section === item.id ? "bg-emerald-50 text-emerald-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <span aria-hidden="true" className="w-5 text-center text-base">{item.icon}</span><span>{item.label}</span>
            </button>)}
          </nav>

          <section className="min-w-0 space-y-5">
            {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
            {isLoading && !data ? <p className="rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">Loading current platform data…</p> : null}

            {data && section === "overview" && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Total users", data.overview.totalUsers.toLocaleString(), "Accounts excluding Admins"],
                  ["Active collectors", data.overview.activeCollectors.toLocaleString(), "Approved and available"],
                  ["Facilities", data.overview.facilities.toLocaleString(), "Approved and active"],
                  ["Pending requests", data.overview.pendingRequests.toLocaleString(), "Waiting for assignment"],
                  ["Active pickups", data.overview.activePickups.toLocaleString(), "Assigned or in progress"],
                  ["Verified recycled", `${data.overview.totalRecycledKg.toLocaleString()} kg`, "Facility-confirmed weight"],
                ].map(([label, value, note]) => <article key={label} className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm font-medium text-gray-600">{label}</p><p className="mt-2 font-display text-2xl font-extrabold text-gray-950">{value}</p><p className="mt-1 text-xs text-gray-500">{note}</p></article>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Completed today", data.overview.completedToday],
                  ["Collector approvals", data.overview.pendingCollectorApprovals],
                  ["Facility approvals", data.overview.pendingFacilityApprovals],
                  ["Points issued / redeemed", `${data.overview.pointsIssued.toLocaleString()} / ${data.overview.pointsRedeemed.toLocaleString()}`],
                  ["Rewards redeemed", data.overview.rewardsRedeemed],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"><span className="text-sm text-gray-600">{label}</span><strong className="font-display text-lg text-gray-900">{value}</strong></div>)}
              </div>
              <article className="rounded-lg border border-gray-200 bg-white p-5"><h2 className="font-display text-base font-bold">Needs attention</h2><div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setSection("collectors")} className="rounded-md border border-gray-200 px-3 py-2 text-sm">{data.overview.pendingCollectorApprovals} collector approvals</button>
                <button onClick={() => setSection("facilities")} className="rounded-md border border-gray-200 px-3 py-2 text-sm">{data.overview.pendingFacilityApprovals} facility approvals</button>
                <button onClick={() => setSection("requests")} className="rounded-md border border-gray-200 px-3 py-2 text-sm">{data.overview.pendingRequests} unassigned requests</button>
              </div></article>
            </>}

            {data && section === "users" && <>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-600">Account status, collection count, points balance, and recent ledger activity.</p><input aria-label="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, email, role" className="w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" /></div>
              {filteredUsers.length ? <DataTable headings={["User", "Role", "Collections", "Points", "Status", "Actions"]}>{filteredUsers.map((user) => <>
                <tr key={user.id}>
                  <td className="px-4 py-3"><button onClick={() => setOpenUserId(openUserId === user.id ? "" : user.id)} className="text-left font-semibold text-gray-900 hover:underline">{user.displayName}</button><p className="text-xs text-gray-500">{user.email}</p></td>
                  <td className="px-4 py-3">{formatStatus(user.role)}</td><td className="px-4 py-3">{user.collections}</td><td className="px-4 py-3">{user.pointsBalance.toLocaleString()}</td><td className="px-4 py-3"><RequestStatus status={user.status} /></td>
                  <td className="px-4 py-3"><button disabled={isWorking} onClick={() => { const reason = askReason(`${user.status === "SUSPENDED" ? "Reason to reactivate" : "Reason to suspend"} ${user.email}`); if (reason) void mutate(() => setAdminUserStatus(user.id, user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED", reason)); }} className="text-xs font-semibold text-emerald-800 underline">{user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button></td>
                </tr>
                {openUserId === user.id && <tr key={`${user.id}-detail`}><td colSpan={6} className="bg-gray-50 px-4 py-3"><p className="text-xs font-semibold uppercase text-gray-500">Recent collection history</p>{user.recentCollections.length ? <div className="mt-2 flex flex-wrap gap-2">{user.recentCollections.map((collection) => <span key={collection.id} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs">{collection.material.name} · {formatStatus(collection.status)} · {collection.weight?.verifiedKg ?? collection.weight?.actualKg ?? collection.estimatedKg} kg</span>)}</div> : <p className="mt-1 text-sm text-gray-500">No collection history.</p>}<p className="mt-4 text-xs font-semibold uppercase text-gray-500">Recent reward ledger</p>{user.recentTransactions.length ? <div className="mt-2 flex flex-wrap gap-2">{user.recentTransactions.map((transaction) => <span key={transaction.id} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs">{transaction.pointsDelta > 0 ? "+" : ""}{transaction.pointsDelta} points · {transaction.type} · {transaction.description ?? "No description"}</span>)}</div> : <p className="mt-1 text-sm text-gray-500">No reward transactions.</p>}</td></tr>}
              </>)}</DataTable> : <EmptyState>No users match this search.</EmptyState>}
            </>}

            {data && section === "collectors" && (data.collectors.length ? <DataTable headings={["Collector", "Approval", "Availability", "Service area / last known", "Vehicle", "Workload", "Actions"]}>{data.collectors.map((collector) => <tr key={collector.id}>
              <td className="px-4 py-3"><strong>{collector.displayName}</strong><p className="text-xs text-gray-500">{collector.email}</p></td><td className="px-4 py-3"><RequestStatus status={collector.approvalStatus} /></td><td className="px-4 py-3">{formatStatus(collector.availability)}<p className="text-xs text-gray-500">Account {formatStatus(collector.accountStatus)}</p></td><td className="px-4 py-3">{collector.serviceArea ?? "Not set"}<p className="text-xs text-gray-500">{collector.serviceRadiusKm ?? "?"} km radius</p><p className="mt-1 text-xs text-gray-700">{collector.currentLatitude !== null && collector.currentLongitude !== null ? `Last known ${collector.currentLatitude.toFixed(3)}, ${collector.currentLongitude.toFixed(3)}` : "No current coordinates"}</p><p className="text-[11px] text-gray-500">{collector.lastLocationUpdatedAt ? `Updated ${new Date(collector.lastLocationUpdatedAt).toLocaleString()}` : "Location not shared"}</p></td><td className="px-4 py-3">{collector.vehicleType ?? "Not provided"}<p className="text-xs text-gray-500">{collector.vehicleRegistration ?? ""}</p></td><td className="px-4 py-3">{collector.workload}</td>
              <td className="space-y-2 px-4 py-3">{collector.approvalStatus === "PENDING" && <><button onClick={() => void mutate(() => decideCollector(collector.id, "APPROVED"))} className="block text-xs font-semibold text-emerald-800 underline">Approve</button><button onClick={() => { const reason = askReason("Reason to reject collector application"); if (reason) void mutate(() => decideCollector(collector.id, "REJECTED", reason)); }} className="block text-xs font-semibold text-rose-700 underline">Reject</button></>}{collector.approvalStatus === "APPROVED" && <button onClick={() => { const reason = askReason("Reason to suspend collector account"); if (reason) void mutate(() => setAdminUserStatus(collector.userId, "SUSPENDED", reason)); }} className="text-xs font-semibold text-rose-700 underline">Suspend account</button>}</td>
            </tr>)}</DataTable> : <EmptyState>No collector profiles are registered yet.</EmptyState>)}

            {data && section === "facilities" && (data.facilities.length ? <DataTable headings={["Facility", "Owner", "Materials", "Opening hours", "Status", "Actions"]}>{data.facilities.map((facility) => <tr key={facility.id}>
              <td className="px-4 py-3"><strong>{facility.name}</strong><p className="max-w-56 text-xs text-gray-500">{facility.address}</p></td><td className="px-4 py-3">{facility.owner?.displayName ?? "No owner"}<p className="text-xs text-gray-500">{facility.owner?.email ?? ""}</p></td><td className="px-4 py-3">{facility.acceptedMaterials.join(", ") || "None"}</td><td className="px-4 py-3 text-xs">{facility.openingHours.map((hour) => <p key={hour.dayOfWeek}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][hour.dayOfWeek]} {hour.isClosed ? "Closed" : `${hour.opensAt ?? ""}–${hour.closesAt ?? ""}`}</p>)}</td><td className="px-4 py-3"><RequestStatus status={facility.isSuspended ? "SUSPENDED" : facility.approvalStatus} /></td>
              <td className="space-y-2 px-4 py-3">{facility.approvalStatus === "PENDING" && <><button onClick={() => void mutate(() => decideFacility(facility.id, "APPROVED"))} className="block text-xs font-semibold text-emerald-800 underline">Approve</button><button onClick={() => { const reason = askReason("Reason to reject facility application"); if (reason) void mutate(() => decideFacility(facility.id, "REJECTED", reason)); }} className="block text-xs font-semibold text-rose-700 underline">Reject</button></>}{facility.approvalStatus === "APPROVED" && <button onClick={() => { const reason = askReason(facility.isSuspended ? "Reason to reactivate facility" : "Reason to suspend facility"); if (reason) void mutate(() => setAdminFacilityStatus(facility.id, facility.isSuspended ? "ACTIVE" : "SUSPENDED", reason)); }} className="text-xs font-semibold text-rose-700 underline">{facility.isSuspended ? "Reactivate" : "Suspend"}</button>}</td>
            </tr>)}</DataTable> : <EmptyState>No recycling facilities are registered yet.</EmptyState>)}

            {data && section === "requests" && <>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-600">Select a waiting request to compare approved collectors. ETA uses a 20 km/h straight-line estimate.</p><div className="flex flex-wrap gap-2"><input aria-label="Search collection requests" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search recycler, material, location" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" /><select aria-label="Filter collection request status" value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"><option value="ALL">All statuses</option>{["WAITING_FOR_ADMIN", "COLLECTOR_ASSIGNED", "COLLECTOR_ON_THE_WAY", "COLLECTOR_ARRIVED", "VERIFICATION_PENDING", "VERIFIED", "COMPLETED", "CANCELLED", "REJECTED"].map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></div></div>
              {visibleRequests.length ? <DataTable headings={["Request", "Recycler", "Material", "Estimate", "Requested", "Status", "Assignment"]}>{visibleRequests.map((request) => <>
                <tr key={request.id} className={`${request.status === "WAITING_FOR_ADMIN" ? "cursor-pointer" : ""} hover:bg-gray-50`} onClick={() => { if (request.status !== "WAITING_FOR_ADMIN") return; setOpenRequestId(openRequestId === request.id ? "" : request.id); if (candidateRequestId !== request.id) void openCandidates(request.id); }}>
                  <td className="px-4 py-3 font-semibold">{request.id.slice(-8).toUpperCase()}</td><td className="px-4 py-3">{request.requester?.recyclerProfile?.displayName ?? request.requester?.email ?? "Recycler"}<p className="text-xs text-gray-500">{request.pickupAddress}</p></td><td className="px-4 py-3">{request.material.name}</td><td className="px-4 py-3">{Number(request.estimatedKg).toLocaleString()} kg</td><td className="px-4 py-3">{new Date(request.requestedFor).toLocaleString()}</td><td className="px-4 py-3"><RequestStatus status={request.status} /></td><td className="px-4 py-3">{request.destinationFacility?.name ?? "No destination"}</td>
                </tr>
                {openRequestId === request.id && <tr key={`${request.id}-candidates`}><td colSpan={7} className="bg-gray-50 px-4 py-4"><h3 className="font-semibold">Eligible collectors</h3>{candidateRequestId !== request.id ? <p className="mt-2 text-sm text-gray-500">Loading candidates…</p> : candidates.length ? <><AssignmentMap request={request} candidates={candidates} /><div className="grid gap-2 md:grid-cols-2">{candidates.map((candidate) => <article key={candidate.profileId} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3"><div><p className="font-semibold">{candidate.displayName ?? candidate.email}</p><p className="text-xs text-gray-500">{candidate.distanceKm.toFixed(1)} km · approx. {candidate.etaMinutes} min · {candidate.activeWorkload} active pickups</p><p className="text-[11px] text-gray-500">{candidate.locationSource === "CURRENT" ? "Recent location" : "Service center"} · estimate, not live routing</p></div><button disabled={isWorking} onClick={(event) => { event.stopPropagation(); void mutate(() => assignCollector(request.id, candidate.profileId)); }} className="shrink-0 rounded-md bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900">Assign</button></article>)}</div></> : <p className="mt-2 text-sm text-gray-500">No eligible collectors have a valid service location and availability.</p>}</td></tr>}
              </>)}</DataTable> : <EmptyState>No collection requests match these filters.</EmptyState>}
            </>}

            {data && section === "active" && <>
              <p className="text-sm text-gray-600">Markers show pickup locations and the collector&apos;s last stored coordinates. Locations are not live-tracked.</p>
              {data.activeCollections.length ? <><ActiveCollectionsMap requests={data.activeCollections} /><DataTable headings={["Collection", "Material", "Collector", "Status", "Last update"]}>{data.activeCollections.map((request) => {
                const assignment = request.assignments[0];
                const collector = assignment?.collector;
                return <tr key={request.id}><td className="px-4 py-3">{request.id.slice(-8).toUpperCase()}<p className="text-xs text-gray-500">{request.pickupAddress}</p></td><td className="px-4 py-3">{request.material.name}</td><td className="px-4 py-3">{collector?.user.recyclerProfile?.displayName ?? collector?.user.email ?? "Unassigned"}</td><td className="px-4 py-3"><RequestStatus status={request.status} /></td><td className="px-4 py-3">{collector?.lastLocationUpdatedAt ? new Date(collector.lastLocationUpdatedAt).toLocaleString() : "No recent location"}</td></tr>;
              })}</DataTable></> : <EmptyState>No active collections to map.</EmptyState>}
            </>}

            {data && section === "verification" && <>
              <p className="text-sm text-gray-600">Facility members record verified weight. Admins monitor these records; points are calculated from verified kg and active material rates.</p>
              {data.verification.length ? <DataTable headings={["Collection", "Material", "Facility", "Actual kg", "Estimated kg", "Status"]}>{data.verification.map((request) => <tr key={request.id}><td className="px-4 py-3">{request.id.slice(-8).toUpperCase()}</td><td className="px-4 py-3">{request.material.name}</td><td className="px-4 py-3">{request.destinationFacility?.name ?? "Unknown"}</td><td className="px-4 py-3">{request.weight?.actualKg ?? "Not recorded"}</td><td className="px-4 py-3">{request.weight?.estimatedKg ?? request.estimatedKg}</td><td className="px-4 py-3"><RequestStatus status={request.status} /></td></tr>)}</DataTable> : <EmptyState>No collections are awaiting facility verification.</EmptyState>}
            </>}

            {data && section === "rewards" && <>
              <p className="text-sm text-gray-600">Current active rates apply to future verifications. Historical rates remain visible for audit.</p>
              {data.rates.length ? <DataTable headings={["Material", "Active points / kg", "Effective from", "New rate", "Action"]}>{data.rates.map((rate) => <tr key={rate.id}><td className="px-4 py-3 font-semibold">{rate.name}</td><td className="px-4 py-3">{rate.activeRate?.pointsPerKg ?? "No rate"}</td><td className="px-4 py-3">{rate.activeRate ? new Date(rate.activeRate.startsAt).toLocaleDateString() : "—"}</td><td className="px-4 py-3"><input aria-label={`New ${rate.name} points per kg`} type="number" min="0" max="10000" step="1" value={rateInputs[rate.id] ?? ""} onChange={(event) => setRateInputs((current) => ({ ...current, [rate.id]: event.target.value }))} className="w-28 rounded-md border border-gray-300 px-2 py-1.5" /></td><td className="px-4 py-3"><button disabled={isWorking || rateInputs[rate.id] === undefined || rateInputs[rate.id] === ""} onClick={() => void mutate(async () => { await updateMaterialRate(rate.id, Number(rateInputs[rate.id])); setRateInputs((current) => ({ ...current, [rate.id]: "" })); })} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">Save rate</button></td></tr>)}</DataTable> : <EmptyState>No active materials have rates configured.</EmptyState>}
              <p className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">Reward conversion: 500 points = R100 (R0.20 per point). This value is informational; no payment is made here.</p>
            </>}

            {data && section === "redemptions" && (data.redemptions.length ? <DataTable headings={["User", "Points", "Value", "Reference", "Status", "Actions"]}>{data.redemptions.map((redemption) => <tr key={redemption.id}><td className="px-4 py-3">{redemption.user.displayName}<p className="text-xs text-gray-500">{redemption.user.email}</p></td><td className="px-4 py-3">{redemption.pointsCost}</td><td className="px-4 py-3">R{redemption.randValue.toFixed(2)}</td><td className="px-4 py-3">{redemption.reference}</td><td className="px-4 py-3"><RequestStatus status={redemption.status} /></td><td className="space-y-2 px-4 py-3">{redemption.status === "REQUESTED" && <><button onClick={() => void mutate(() => decideRedemption(redemption.id, "APPROVED"))} className="block text-xs font-semibold text-emerald-800 underline">Approve</button><button onClick={() => { const reason = askReason("Reason to reject redemption"); if (reason) void mutate(() => decideRedemption(redemption.id, "REJECTED", reason)); }} className="block text-xs font-semibold text-rose-700 underline">Reject</button></>}{redemption.status === "APPROVED" && <button onClick={() => void mutate(() => decideRedemption(redemption.id, "FULFILLED"))} className="text-xs font-semibold text-emerald-800 underline">Mark delivered</button>}</td></tr>)}</DataTable> : <EmptyState>No reward redemptions have been requested.</EmptyState>)}

            {data && section === "analytics" && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
                ["Verified recycled", `${data.analytics.totalVerifiedKg.toLocaleString()} kg`], ["Collections", data.analytics.totalCollections], ["Completed", data.analytics.completedCollections], ["Cancelled", data.analytics.cancelledCollections], ["Active users", data.analytics.activeUsers], ["Active collectors", data.analytics.activeCollectors], ["Facilities", data.analytics.registeredFacilities], ["Informational rewards", `R${data.analytics.rewardValueRand.toFixed(2)}`],
              ].map(([label, value]) => <article key={label} className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 font-display text-xl font-extrabold">{value}</p></article>)}</div>
              <article className="rounded-lg border border-gray-200 bg-white p-5"><h2 className="font-display font-bold">Verified kilograms by material</h2>{data.analytics.materialTotals.length ? <div className="mt-4 space-y-4">{data.analytics.materialTotals.map((entry) => { const maximum = Math.max(...data.analytics.materialTotals.map((item) => item.verifiedKg), 1); return <div key={entry.material}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{entry.material}</span><strong>{entry.verifiedKg.toLocaleString()} kg</strong></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(0, Math.min(100, (entry.verifiedKg / maximum) * 100))}%` }} /></div></div>; })}</div> : <p className="mt-3 text-sm text-gray-500">No verified recycling data yet.</p>}<p className="mt-4 text-xs text-gray-500">Totals are from persisted request records; estimated kg is not counted as recycled.</p></article>
            </>}

            {data && section === "reports" && (data.reports.length ? <DataTable headings={["Report", "Reporter", "Category", "Description", "Status", "Actions"]}>{data.reports.map((report) => <tr key={report.id}><td className="px-4 py-3">{report.id.slice(-8).toUpperCase()}<p className="text-xs text-gray-500">{new Date(report.createdAt).toLocaleDateString()}</p></td><td className="px-4 py-3">{report.reporterName}<p className="text-xs text-gray-500">{report.reporterEmail}</p></td><td className="px-4 py-3">{formatStatus(report.type)}</td><td className="max-w-sm px-4 py-3">{report.description}</td><td className="px-4 py-3"><RequestStatus status={report.status} /></td><td className="space-y-2 px-4 py-3">{report.status !== "RESOLVED" && report.status !== "REJECTED" && <><button onClick={() => void mutate(() => updateAdminReport(report.id, "UNDER_REVIEW"))} className="block text-xs font-semibold text-sky-800 underline">Investigate</button><button onClick={() => void mutate(() => updateAdminReport(report.id, "RESOLVED"))} className="block text-xs font-semibold text-emerald-800 underline">Resolve</button><button onClick={() => { const reason = askReason("Reason to reject report"); if (reason) void mutate(() => updateAdminReport(report.id, "REJECTED", reason)); }} className="block text-xs font-semibold text-rose-700 underline">Reject</button></>}</td></tr>)}</DataTable> : <EmptyState>No reports have been submitted.</EmptyState>)}

            {data && section === "notifications" && (data.notifications.length ? <div className="space-y-2">{data.notifications.map((notification) => <article key={notification.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 ${notification.readAt ? "border-gray-200 bg-white" : "border-emerald-200 bg-emerald-50"}`}><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{notification.title}</h2><RequestStatus status={notification.readAt ? "READ" : "PENDING"} /></div><p className="mt-1 text-sm text-gray-700">{notification.body}</p><p className="mt-2 text-xs text-gray-500">{new Date(notification.createdAt).toLocaleString()} · {formatStatus(notification.type)}</p></div>{!notification.readAt && <button onClick={() => void mutate(() => markAdminNotification(notification.id, true))} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold">Mark read</button>}</article>)}</div> : <EmptyState>No Admin notifications.</EmptyState>)}

            {data && section === "audit" && (data.audit.length ? <DataTable headings={["When", "Admin", "Action", "Target", "Reason"]}>{data.audit.map((entry) => <tr key={entry.id}><td className="px-4 py-3">{new Date(entry.createdAt).toLocaleString()}</td><td className="px-4 py-3">{entry.admin.email}</td><td className="px-4 py-3">{formatStatus(entry.action)}</td><td className="px-4 py-3">{formatStatus(entry.entityType)} · {entry.entityId}</td><td className="max-w-sm px-4 py-3">{entry.reason ?? (entry.metadata ? JSON.stringify(entry.metadata) : "—")}</td></tr>)}</DataTable> : <EmptyState>No Admin actions have been recorded yet.</EmptyState>)}
          </section>
        </div>
      </div>
    </main>
  );
}
