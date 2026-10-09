"use client";

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { materials } from "./locations";
import { getAvailableFacilities, type AvailableFacility, type BufferedCollectionEvent, type CollectionPriority, type CollectionRecord, type CollectorDashboard, type FacilityOperationsDashboard, type FacilityProfileRecord, type RecyclerProfileRecord, type UserNotification } from "../lib/dashboard-api";
import { buildDirectionsUrl } from "../lib/collection-workflow";
import type { Location } from "./locations";

export type CollectionStatus = "Pending" | "Assigned" | "On the way" | "Arrived" | "Collecting" | "Paused" | "Collected" | "Verified" | "Cancelled" | "Rejected";

export type CollectionRequest = {
  id: string;
  recyclerId: string;
  recyclerName: string;
  material: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  estimatedWeightKg: number;
  preferredDate: string;
  status: CollectionStatus;
  collectorId?: string;
  collectorName?: string;
  collectorAccepted?: boolean;
  collectorLatitude?: number | null;
  collectorLongitude?: number | null;
  collectorLocationUpdatedAt?: string | null;
  estimatedEtaMinutes?: number | null;
  priority: CollectionPriority;
  createdAt: string;
  distanceKm?: number | null;
  assignmentStatus?: string;
  assignedAt?: string;
  declineReasonCode?: string | null;
  materialId: string;
  collectedWeightKg?: number;
  verifiedWeightKg?: number;
  materialWeights: Array<{ materialId: string; material: string; actualKg: number; verifiedKg: number | null }>;
  statusEvents?: Array<{ toStatus: string; createdAt: string; note: string | null }>;
};

export type FacilityProfile = {
  name: string;
  address: string;
  acceptedMaterials: string[];
  openingHours: string[];
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function WorkflowFrame({ title, description, onBack, children }: {
  title: string;
  description: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-24">
      <header className="border-b border-gray-100 bg-white px-5 py-5">
        {onBack && <button type="button" onClick={onBack} className="mb-3 text-sm font-semibold text-green-700 hover:text-green-800">← Dashboard</button>}
        <h1 className="font-display text-2xl font-extrabold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </header>
      <div className="space-y-4 px-4 py-5">{children}</div>
    </main>
  );
}

function StatusBadge({ status }: { status: CollectionStatus }) {
  const colors: Record<CollectionStatus, string> = {
    Pending: "bg-amber-100 text-amber-800",
    Assigned: "bg-blue-100 text-blue-800",
    "On the way": "bg-sky-100 text-sky-800",
    Arrived: "bg-indigo-100 text-indigo-800",
    Collecting: "bg-teal-100 text-teal-800",
    Paused: "bg-orange-100 text-orange-800",
    Collected: "bg-teal-100 text-teal-800",
    Verified: "bg-green-100 text-green-800",
    Cancelled: "bg-gray-100 text-gray-700",
    Rejected: "bg-rose-100 text-rose-800",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>{status}</span>;
}

function RequestSummary({ request }: { request: CollectionRequest }) {
  return (
    <div className="mt-3 grid gap-1 text-sm text-gray-600">
      <p><span className="font-semibold text-gray-800">{request.material}</span> · {request.estimatedWeightKg} kg estimated</p>
      <p>{request.pickupAddress}</p>
      <p>Preferred pickup: {request.preferredDate}</p>
      {request.collectorName && <p>Collector: {request.collectorName}</p>}
      {request.collectedWeightKg !== undefined && <p>Collected: {request.collectedWeightKg} kg</p>}
      {request.verifiedWeightKg !== undefined && <p>Verified: {request.verifiedWeightKg} kg</p>}
      {request.materialWeights.map((item) => <p key={item.materialId} className="text-xs">{item.material}: {item.actualKg} kg{item.verifiedKg === null ? "" : ` · ${item.verifiedKg} kg verified`}</p>)}
    </div>
  );
}

export function CollectionRequestScreen({ onBack, onCreate, onCreateBufferedEvent, onResolveBuffer, onBufferComplete, existingBuffer, initialMaterial, initialFacilityId }: {
  onBack: () => void;
  onCreate: (request: { material: string; destinationFacilityId: string; estimatedKg: number; requestedFor: string; pickupAddress: string; pickupLatitude: number; pickupLongitude: number; notes?: string }) => Promise<void>;
  onCreateBufferedEvent: (request: { material: string; destinationFacilityId: string; estimatedKg: number; requestedFor: string; pickupAddress: string; pickupLatitude: number; pickupLongitude: number; notes?: string }) => Promise<BufferedCollectionEvent>;
  onResolveBuffer: (eventId: string) => Promise<void>;
  onBufferComplete: () => Promise<void>;
  existingBuffer: BufferedCollectionEvent | null;
  initialMaterial?: string;
  initialFacilityId?: string;
}) {
  const [material, setMaterial] = useState(initialMaterial ?? materials[1]);
  const [facilities, setFacilities] = useState<AvailableFacility[]>([]);
  const [destinationFacilityId, setDestinationFacilityId] = useState(initialFacilityId ?? "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [bufferEvent, setBufferEvent] = useState<BufferedCollectionEvent | null>(null);
  const [dismissedBufferId, setDismissedBufferId] = useState("");
  const [useEventBuffer, setUseEventBuffer] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getAvailableFacilities(material)
      .then((available) => {
        if (!active) return;
        setFacilities(available);
        setDestinationFacilityId((current) => available.some((facility) => facility.id === current) ? current : available[0]?.id ?? "");
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load approved facilities.");
      });
    return () => { active = false; };
  }, [material]);

  const activeBufferEvent = bufferEvent ?? (existingBuffer?.status === "OPEN" && existingBuffer.id !== dismissedBufferId ? existingBuffer : null);

  useEffect(() => {
    if (!activeBufferEvent || activeBufferEvent.status !== "OPEN") return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((new Date(activeBufferEvent.activateAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        setDismissedBufferId(activeBufferEvent.id);
        setBufferEvent(null);
        setSuccess(true);
        setError("");
        void onBufferComplete();
      }
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 500);
    return () => window.clearInterval(intervalId);
  }, [activeBufferEvent, onBufferComplete]);

  const cancelBuffer = async () => {
    if (!activeBufferEvent) return;
    setIsSubmitting(true);
    try {
      await onResolveBuffer(activeBufferEvent.id);
      setDismissedBufferId(activeBufferEvent.id);
      setBufferEvent(null);
      setSuccess(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel this pickup event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("This browser cannot provide your location. Enter pickup coordinates below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLatitude(String(coords.latitude));
      setLongitude(String(coords.longitude));
      setError("");
    }, () => setError("Location permission was unavailable. Enter pickup coordinates below."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const estimatedWeightKg = Number(estimatedWeight);
    const pickupLatitude = Number(latitude);
    const pickupLongitude = Number(longitude);
    if (!destinationFacilityId || !Number.isFinite(estimatedWeightKg) || estimatedWeightKg <= 0 || !Number.isFinite(pickupLatitude) || !Number.isFinite(pickupLongitude)) {
      setError("Choose an approved facility and provide a valid weight and pickup location.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const requestInput = {
        material,
        destinationFacilityId,
        pickupAddress: pickupAddress.trim(),
        estimatedKg: estimatedWeightKg,
        requestedFor: new Date(`${preferredDate}T${preferredTime || "09:00"}`).toISOString(),
        pickupLatitude,
        pickupLongitude,
        notes: notes.trim() || undefined,
      };
      if (useEventBuffer) {
        setBufferEvent(await onCreateBufferedEvent(requestInput));
        setDismissedBufferId("");
        setSuccess(false);
      } else {
        await onCreate(requestInput);
        setSuccess(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit collection request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WorkflowFrame title="Request a collection" description="Arrange a pickup for recyclable materials." onBack={onBack}>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <fieldset className="grid grid-cols-2 gap-2" aria-label="Request type">
          <button type="button" disabled={Boolean(activeBufferEvent)} aria-pressed={!useEventBuffer} onClick={() => setUseEventBuffer(false)} className={`rounded-md border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${!useEventBuffer ? "border-green-700 bg-green-50 text-green-900" : "border-gray-300 text-gray-700"}`}>Collection request</button>
          <button type="button" disabled={Boolean(activeBufferEvent)} aria-pressed={useEventBuffer} onClick={() => { setUseEventBuffer(true); setSuccess(false); }} className={`rounded-md border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${useEventBuffer ? "border-amber-500 bg-amber-50 text-amber-950" : "border-gray-300 text-gray-700"}`}>Bin-full event</button>
        </fieldset>
        <label className="block text-sm font-medium text-gray-800">
          Material
          <select required value={material} onChange={(event) => { setMaterial(event.target.value); setSuccess(false); }} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
            {materials.slice(1).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-800">Receiving facility
          <select required value={destinationFacilityId} onChange={(event) => setDestinationFacilityId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5" disabled={!facilities.length}>
            <option value="">{facilities.length ? "Choose an approved facility" : "No approved facility accepts this material"}</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} · {facility.address}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-800">
          Pickup address
          <input required minLength={5} value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="Street, suburb, city" />
        </label>
        <label className="block text-sm font-medium text-gray-800">
          Estimated quantity (kg)
          <input required type="number" min="0.1" step="0.1" value={estimatedWeight} onChange={(event) => setEstimatedWeight(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-gray-800">
          Preferred collection date
          <input required type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Preferred time
          <input required type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Additional notes
          <textarea maxLength={1000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="Access instructions or collection details" />
        </label>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-gray-800">Pickup coordinates</p><button type="button" onClick={useCurrentLocation} className="text-sm font-semibold text-green-700 underline">Use current location</button></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-gray-700">Latitude<input required type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-gray-700">Longitude<input required type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
          </div>
          <p className="text-xs text-gray-500">Your location is used to match nearby collectors. Browser permission is optional; coordinates can be entered manually.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {activeBufferEvent?.status === "OPEN" && <div role="status" className="flex items-center justify-between gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><span>Pickup pending. You can cancel during the {secondsRemaining}-second buffer.</span><button type="button" disabled={isSubmitting} onClick={() => void cancelBuffer()} className="shrink-0 font-semibold underline">Cancel</button></div>}
        {success && <p role="status" className="text-sm font-medium text-green-700">Pickup Pending. Your request is waiting for Admin assignment and can be tracked from your dashboard.</p>}
        <button type="submit" disabled={isSubmitting || !facilities.length || Boolean(activeBufferEvent)} className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Submitting…" : activeBufferEvent ? `Bin-full event · ${secondsRemaining}s` : useEventBuffer ? "Start 10-second bin-full buffer" : "Submit collection request"}</button>
      </form>
    </WorkflowFrame>
  );
}

export function TrackingScreen({ requests, points, rates, notifications, onBack, onRewards, onRefresh, onCancel, onMarkNotificationRead }: {
  requests: CollectionRequest[];
  points: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
  notifications: UserNotification[];
  onBack: () => void;
  onRewards: () => void;
  onRefresh: () => Promise<void>;
  onCancel: (requestId: string) => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [cancelError, setCancelError] = useState("");
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <WorkflowFrame title="Collection tracking" description="Follow each request from pickup to facility verification." onBack={onBack}>
      <div className="flex justify-end"><button type="button" disabled={isRefreshing} onClick={() => void refresh()} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">{isRefreshing ? "Refreshing…" : "Refresh status"}</button></div>
      <section className="flex items-center justify-between gap-4 rounded-xl border border-green-100 bg-green-50 p-4">
        <div><p className="text-sm text-green-800">Your rewards balance</p><p className="font-display text-2xl font-extrabold text-green-900">{points} points</p></div>
        <button type="button" onClick={onRewards} className="rounded-lg border border-green-700 px-3 py-2 text-sm font-semibold text-green-800 hover:bg-white">Rewards</button>
      </section>
      <p className="text-xs text-gray-500">Points are calculated from verified kilograms using current material rates.</p>
      <div className="flex flex-wrap gap-2">{rates.map((rate) => <span key={rate.material} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs">{rate.material}: {rate.pointsPerKg} points/kg</span>)}</div>
      {cancelError && <p role="alert" className="text-sm text-rose-700">{cancelError}</p>}
      {requests.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">No collection requests yet. Submit a request to start tracking it here.</p>
      ) : requests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} collection</h2><StatusBadge status={request.status} /></div>
          <RequestSummary request={request} />
          {request.collectorName && <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">Collector assigned: <strong>{request.collectorName}</strong> · {request.collectorAccepted ? "Accepted and on the way" : "Waiting for the Collector to respond"}</p>}
          {request.collectorAccepted && ["On the way", "Arrived", "Collecting", "Paused"].includes(request.status) && <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">Collector is on the way. Estimated arrival: {request.estimatedEtaMinutes == null ? "unavailable" : `${request.estimatedEtaMinutes} minutes`}. Exact collector location is private.</p>}
          {["Pending", "Assigned", "On the way", "Arrived"].includes(request.status) && <button type="button" disabled={cancellingId === request.id} onClick={() => {
            if (!window.confirm("Cancel this collection request?")) return;
            setCancellingId(request.id);
            setCancelError("");
            void onCancel(request.id).catch((caught: unknown) => setCancelError(caught instanceof Error ? caught.message : "Could not cancel this request.")).finally(() => setCancellingId(""));
          }} className="mt-3 min-h-10 rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50">{cancellingId === request.id ? "Cancelling…" : "Cancel request"}</button>}
          <ol aria-label={`Status for ${request.material} collection`} className="mt-4 grid grid-cols-3 gap-1 text-center text-[10px] sm:grid-cols-6 sm:text-xs">
            {(["Request submitted", "Collector assigned", "Collector accepted", "On the way", "Collection", "Verified"] as const).map((step, index) => {
              const reached = index === 0
                || (index === 1 && request.status !== "Pending")
                || (index === 2 && request.collectorAccepted === true)
                || (index === 3 && ["On the way", "Arrived", "Collecting", "Paused", "Collected", "Verified"].includes(request.status))
                || (index === 4 && ["Collecting", "Paused", "Collected", "Verified"].includes(request.status))
                || (index === 5 && request.status === "Verified");
              return <li key={step} className={`rounded-md py-1.5 font-semibold ${reached ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{reached ? "✓ " : "○ "}{step}</li>;
            })}
          </ol>
        </article>
      ))}
      {notifications.length > 0 && <section className="space-y-2"><h2 className="font-display text-lg font-bold text-gray-900">Notifications</h2>{notifications.map((notification) => <article key={notification.id} className={`rounded-lg border bg-white p-3 ${notification.readAt ? "border-gray-200" : "border-green-300"}`}><button type="button" onClick={() => { if (!notification.readAt) void onMarkNotificationRead(notification.id); }} className="w-full text-left"><p className="flex items-center justify-between gap-2 font-semibold text-gray-900">{notification.title}{!notification.readAt && <span className="text-xs text-green-800">New</span>}</p><p className="mt-1 text-sm text-gray-600">{notification.body}</p><p className="mt-2 text-xs text-gray-500">{new Date(notification.createdAt).toLocaleString()}</p></button></article>)}</section>}
    </WorkflowFrame>
  );
}

export function RewardsScreen({ points, rates, rewards, transactions, redemptions, onBack, onRedeem, onElectricityRedeem }: {
  points: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
  rewards: Array<{ id: string; name: string; description: string; pointsCost: number; available: boolean }>;
  transactions: Array<{ id: string; type: string; pointsDelta: number; randValueCents: number; description: string | null; createdAt: string }>;
  redemptions: Array<{ id: string; reference: string; type: "REWARD" | "ELECTRICITY"; pointsCost: number; valueCents: number; status: string; rewardName: string | null; meterNumberMasked: string | null; createdAt: string }>;
  onBack: () => void;
  onRedeem: (rewardId: string, idempotencyKey: string) => Promise<void>;
  onElectricityRedeem: (cost: number, meterNumber: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [meterNumber, setMeterNumber] = useState("");
  const [electricityPoints, setElectricityPoints] = useState("");
  const [redemptionKeys, setRedemptionKeys] = useState<Record<string, string>>({});

  const redeem = async (reward: { id: string; name: string; pointsCost: number }) => {
    if (!window.confirm(`Redeem ${reward.name} for ${reward.pointsCost} points?`)) return;
    setIsRedeeming(true);
    try {
      const idempotencyKey = redemptionKeys[reward.id] ?? crypto.randomUUID();
      setRedemptionKeys((current) => ({ ...current, [reward.id]: idempotencyKey }));
      await onRedeem(reward.id, idempotencyKey);
      setRedemptionKeys((current) => { const next = { ...current }; delete next[reward.id]; return next; });
      setIsError(false);
      setFeedback(`${reward.name} requested for ${reward.pointsCost} points. An Admin must approve the redemption.`);
    } catch (caught) {
      setIsError(true);
      setFeedback(caught instanceof Error ? caught.message : "The reward redemption could not be requested.");
    } finally {
      setIsRedeeming(false);
    }
  };

  const redeemElectricity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cost = Number(electricityPoints);
    if (!Number.isInteger(cost) || cost < 1 || cost > points) {
      setIsError(true);
      setFeedback("Enter a whole point amount within your available balance.");
      return;
    }
    setIsRedeeming(true);
    try {
      await onElectricityRedeem(cost, meterNumber.trim());
      setIsError(false);
      setFeedback(`Electricity redemption request submitted for ${cost} points. Fulfillment is reviewed and handled manually.`);
      setMeterNumber("");
      setElectricityPoints("");
    } catch (caught) {
      setIsError(true);
      setFeedback(caught instanceof Error ? caught.message : "The electricity redemption could not be requested.");
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <WorkflowFrame title="Rewards" description="Redeem prototype rewards using points from verified collections." onBack={onBack}>
      <section className="rounded-xl bg-green-700 p-5 text-white"><p className="text-sm text-green-100">Available balance</p><p className="font-display text-3xl font-extrabold">{points} points</p></section>
      <p className="text-xs text-gray-500">Rewards are prototypes, not cash payouts. Verified collection points use these material rates:</p>
      <div className="flex flex-wrap gap-2">{rates.map((rate) => <span key={rate.material} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs">{rate.material}: {rate.pointsPerKg} points/kg</span>)}</div>
      {feedback && <p role={isError ? "alert" : "status"} className={`text-sm font-medium ${isError ? "text-red-700" : "text-green-700"}`}>{feedback}</p>}
      {rewards.map((reward) => (
        <article key={reward.id} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4">
          <div><h2 className="font-semibold text-gray-900">{reward.name}</h2><p className="mt-1 text-sm text-gray-500">{reward.description}</p><p className="mt-1 text-xs font-semibold text-gray-700">{reward.pointsCost} points · {reward.available ? "Available" : "Unavailable"}</p></div>
          <button type="button" disabled={isRedeeming || points < reward.pointsCost || !reward.available} onClick={() => void redeem(reward)} className="shrink-0 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300">{isRedeeming ? "Requesting…" : "Redeem"}</button>
        </article>
      ))}
      {transactions.length > 0 && <section className="space-y-2"><h2 className="font-display text-lg font-bold text-gray-900">Reward history</h2>{transactions.map((transaction) => <article key={transaction.id} className="flex items-center justify-between gap-3 border-b border-gray-200 py-2 text-sm"><div><p className="font-semibold text-gray-800">{transaction.description ?? transaction.type.replaceAll("_", " ")}</p><p className="text-xs text-gray-500">{new Date(transaction.createdAt).toLocaleString()}</p></div><strong className={transaction.pointsDelta >= 0 ? "text-green-800" : "text-rose-800"}>{transaction.pointsDelta > 0 ? "+" : ""}{transaction.pointsDelta} points</strong></article>)}</section>}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div><h2 className="font-display font-bold text-gray-900">Electricity redemption</h2><p className="mt-1 text-sm text-gray-600">Submit your meter number and points amount for Admin review. 1 point is shown as R0.20; this prototype does not buy electricity or issue a token.</p></div>
        <form onSubmit={(event) => void redeemElectricity(event)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="text-sm font-medium text-gray-800">Meter number
            <input required minLength={6} maxLength={32} pattern="[A-Za-z0-9-]{6,32}" value={meterNumber} onChange={(event) => setMeterNumber(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" autoComplete="off" />
          </label>
          <label className="text-sm font-medium text-gray-800">Points
            <input required type="number" min="1" max={points} step="1" value={electricityPoints} onChange={(event) => setElectricityPoints(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" />
          </label>
          <button type="submit" disabled={isRedeeming || points < 1} className="rounded-md bg-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isRedeeming ? "Submitting…" : "Use points"}</button>
        </form>
        {electricityPoints && Number.isInteger(Number(electricityPoints)) && Number(electricityPoints) > 0 && <p className="text-xs text-gray-500">Informational value: R{(Number(electricityPoints) * 0.2).toFixed(2)}. No electricity token is generated.</p>}
      </section>
      {redemptions.length > 0 && <section className="space-y-2"><h2 className="font-display text-lg font-bold text-gray-900">Redemption requests</h2>{redemptions.map((redemption) => <article key={redemption.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3"><div><p className="font-semibold text-gray-900">{redemption.type === "ELECTRICITY" ? "Electricity" : "Reward"} · {redemption.reference}</p><p className="text-xs text-gray-600">{redemption.pointsCost} points · R{(redemption.valueCents / 100).toFixed(2)}{redemption.meterNumberMasked ? ` · meter ${redemption.meterNumberMasked}` : ""}</p></div><span className="text-sm font-semibold text-gray-700">{redemption.status.replaceAll("_", " ")}</span></article>)}</section>}
    </WorkflowFrame>
  );
}

export function RecyclerProfileScreen({ profile, onBack, onSave, onChangePassword }: {
  profile: RecyclerProfileRecord | null;
  onBack: () => void;
  onSave: (input: Partial<RecyclerProfileRecord>) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [collectionAddress, setCollectionAddress] = useState(profile?.collectionAddress ?? "");
  const [latitude, setLatitude] = useState(profile?.collectionLatitude === null || profile?.collectionLatitude === undefined ? "" : String(profile.collectionLatitude));
  const [longitude, setLongitude] = useState(profile?.collectionLongitude === null || profile?.collectionLongitude === undefined ? "" : String(profile.collectionLongitude));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const hasLocation = latitude.trim() !== "" && longitude.trim() !== "";
      await onSave({
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        collectionAddress: collectionAddress.trim() || null,
        collectionLatitude: hasLocation ? Number(latitude) : null,
        collectionLongitude: hasLocation ? Number(longitude) : null,
      });
      setMessage("Profile updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const useProfileLocation = () => {
    if (!navigator.geolocation) {
      setError("This browser cannot provide your location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLatitude(String(coords.latitude));
      setLongitude(String(coords.longitude));
      setError("");
    }, () => setError("Location permission was unavailable."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Other active sessions were signed out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change your password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WorkflowFrame title="Your profile" description="Manage your citizen contact and collection details." onBack={onBack}>
      {!profile && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Loading your profile…</p>}
      <form onSubmit={(event) => void saveProfile(event)} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-800">Name<input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
        <label className="block text-sm font-medium text-gray-800">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
        <label className="block text-sm font-medium text-gray-800">Phone<input type="tel" minLength={7} maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
        <label className="block text-sm font-medium text-gray-800">Collection address<textarea rows={3} maxLength={300} value={collectionAddress} onChange={(event) => setCollectionAddress(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
        <div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-gray-800">Registered location for nearby issue reports</span><button type="button" onClick={useProfileLocation} className="text-xs font-semibold text-green-800 underline">Use my location</button></div><div className="grid grid-cols-2 gap-2"><label className="text-xs text-gray-600">Latitude<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2" /></label><label className="text-xs text-gray-600">Longitude<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-2" /></label></div><p className="text-xs text-gray-500">Optional. This helps weight nearby community reports and is never shown to other users.</p></div>
        <button type="submit" disabled={isSaving || !profile} className="rounded-md bg-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save profile</button>
      </form>
      <form onSubmit={(event) => void savePassword(event)} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-display font-bold text-gray-900">Change password</h2>
        <label className="block text-sm font-medium text-gray-800">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
        <label className="block text-sm font-medium text-gray-800">New password<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /><span className="mt-1 block text-xs text-gray-500">Use at least 12 characters.</span></label>
        <button type="submit" disabled={isSaving} className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50">Change password</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    </WorkflowFrame>
  );
}

export function CollectorBoardScreen({ requests, onBack, onAccept, onDecline }: {
  requests: CollectionRequest[];
  onBack: () => void;
  onAccept: (requestId: string) => Promise<void>;
  onDecline: (requestId: string, reasonCode: string, explanation?: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [decliningRequestId, setDecliningRequestId] = useState("");
  const [declineReasonCode, setDeclineReasonCode] = useState("OTHER");
  const [declineExplanation, setDeclineExplanation] = useState("");

  const accept = async (requestId: string) => {
    setBusyId(requestId);
    setError("");
    try {
      await onAccept(requestId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not accept this assignment.");
    } finally {
      setBusyId("");
    }
  };

  const decline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId(decliningRequestId);
    setError("");
    try {
      await onDecline(decliningRequestId, declineReasonCode, declineExplanation.trim() || undefined);
      setDecliningRequestId("");
      setDeclineExplanation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not decline this assignment.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <WorkflowFrame title="Collection queue" description="Priority-ranked jobs matched to your availability and material qualifications." onBack={onBack}>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {requests.length === 0 ? <p className="border-y border-gray-200 bg-white p-5 text-sm text-gray-600">No assigned jobs. New matching work will appear here.</p> : requests.map((request) => (
        <article key={request.id} className={`border-y bg-white p-4 ${request.priority === "CRITICAL" ? "border-rose-400 border-y-2" : request.priority === "HIGH" ? "border-orange-300 border-y-2" : "border-gray-200"}`}>
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><p className="mt-1 text-xs text-gray-500">COL-{request.id.slice(-4).toUpperCase()}</p></div><div className="flex flex-col items-end gap-2"><PriorityBadge priority={request.priority} /><StatusBadge status={request.status} /></div></div>
          <p className="mt-2 text-sm text-gray-600">Requested by {request.recyclerName}</p>
          <RequestSummary request={request} />
          <p className="mt-2 text-xs text-gray-500">{request.distanceKm == null ? "Distance unavailable" : `${request.distanceKm.toFixed(1)} km away`} · Added {new Date(request.createdAt).toLocaleString()}</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void accept(request.id)} className="min-h-11 rounded-md bg-green-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-50">{busyId === request.id ? "Accepting…" : "Accept"}</button><button type="button" disabled={busyId === request.id} onClick={() => { setDecliningRequestId(request.id); setDeclineReasonCode("OTHER"); setDeclineExplanation(""); setError(""); }} className="min-h-11 rounded-md border border-rose-300 px-3 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Decline</button></div>
        </article>
      ))}
      {decliningRequestId && <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => { if (!busyId) setDecliningRequestId(""); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="decline-assignment-title" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <h2 id="decline-assignment-title" className="font-display text-lg font-bold text-gray-900">Decline assignment</h2>
          <p className="mt-1 text-sm text-gray-600">Choose a reason. An explanation is optional.</p>
          <form onSubmit={(event) => void decline(event)} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-800">Reason code
              <select required value={declineReasonCode} onChange={(event) => setDeclineReasonCode(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5">
                <option value="VEHICLE_FULL">Vehicle full</option><option value="TOO_FAR">Too far</option><option value="UNAVAILABLE">Unavailable</option><option value="MATERIAL_UNSUPPORTED">Material unsupported</option><option value="SAFETY_ISSUE">Safety issue</option><option value="OTHER">Other</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-800">Explanation (optional)<textarea maxLength={500} rows={3} value={declineExplanation} onChange={(event) => setDeclineExplanation(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => setDecliningRequestId("")} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={Boolean(busyId)} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === decliningRequestId ? "Declining…" : "Confirm decline"}</button></div>
          </form>
        </section>
      </div>}
    </WorkflowFrame>
  );
}

export function CollectorPickupsScreen({ requests, materials: availableMaterials, onBack, onRecordCollection, onUpdateLocation, onUpdateProgress }: {
  requests: CollectionRequest[];
  materials: Array<{ id: string; name: string }>;
  onBack: () => void;
  onRecordCollection: (requestId: string, input: { materials: Array<{ materialId: string; actualKg: number }>; notes?: string }) => Promise<void>;
  onUpdateLocation: (latitude: number, longitude: number) => Promise<void>;
  onUpdateProgress: (requestId: string, action: "ARRIVED" | "START" | "PAUSE" | "RESUME", details?: { delayCode?: string; explanation?: string }) => Promise<void>;
}) {
  const [weights, setWeights] = useState<Record<string, Array<{ materialId: string; value: string }>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [pausingRequestId, setPausingRequestId] = useState("");
  const [delayCode, setDelayCode] = useState("OTHER");
  const [delayExplanation, setDelayExplanation] = useState("");
  const assignedRequests = requests.filter((request) => ["On the way", "Arrived", "Collecting", "Paused"].includes(request.status));
  const completedRequests = requests.filter((request) => request.status === "Collected" || request.status === "Verified");

  const linesFor = (request: CollectionRequest) => weights[request.id] ?? [{ materialId: request.materialId, value: String(request.estimatedWeightKg) }];

  const openDirections = (request: CollectionRequest) => {
    const destination = request.pickupLatitude !== undefined && request.pickupLongitude !== undefined
      ? `${request.pickupLatitude},${request.pickupLongitude}`
      : request.pickupAddress;
    const url = buildDirectionsUrl(destination);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const recordCollection = async (event: FormEvent<HTMLFormElement>, request: CollectionRequest) => {
    event.preventDefault();
    const materialWeights = linesFor(request).map((line) => ({ materialId: line.materialId, actualKg: Number(line.value) }));
    if (!materialWeights.length || materialWeights.some((item) => !item.materialId || !Number.isFinite(item.actualKg) || item.actualKg < 0) || materialWeights.reduce((total, item) => total + item.actualKg, 0) <= 0) {
      setError("Choose valid materials and enter a positive total weight.");
      return;
    }
    setBusyId(request.id);
    setError("");
    try {
      await onRecordCollection(request.id, { materials: materialWeights, notes: notes[request.id]?.trim() || undefined });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record collected material.");
    } finally {
      setBusyId("");
    }
  };

  const updateLocation = () => {
    if (!navigator.geolocation) {
      setError("This browser cannot provide a location.");
      return;
    }
    setIsUpdatingLocation(true);
    setError("");
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      void onUpdateLocation(coords.latitude, coords.longitude)
        .then(() => setLocationMessage("Last-known location updated for Admin assignment matching."))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not update your location."))
        .finally(() => setIsUpdatingLocation(false));
    }, () => {
      setError("Location permission was unavailable. No location was updated.");
      setIsUpdatingLocation(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const updateProgress = async (requestId: string, action: "ARRIVED" | "START" | "PAUSE" | "RESUME", details?: { delayCode?: string; explanation?: string }) => {
    setBusyId(requestId);
    setError("");
    try {
      await onUpdateProgress(requestId, action, details);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update pickup status.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <WorkflowFrame title="My pickups" description="Navigate to pickup addresses and record materials collected." onBack={onBack}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Location is shared as a timestamped last-known point, not live tracking.</p><button type="button" disabled={isUpdatingLocation} onClick={updateLocation} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{isUpdatingLocation ? "Updating…" : "Update my location"}</button></div>
      {locationMessage && <p role="status" className="text-sm text-green-700">{locationMessage}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {assignedRequests.length === 0 && completedRequests.length === 0 && <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">You have no assigned pickups. Accept a request from the request board.</p>}
      {assignedRequests.map((request) => (
        <article key={request.id} className={`rounded-md border bg-white p-4 ${request.priority === "CRITICAL" ? "border-rose-400 border-l-4" : request.priority === "HIGH" ? "border-orange-300 border-l-4" : "border-gray-200"}`}>
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><p className="mt-1 text-xs text-gray-500">COL-{request.id.slice(-4).toUpperCase()}</p></div><div className="flex flex-col items-end gap-2"><PriorityBadge priority={request.priority} /><StatusBadge status={request.status} /></div></div>
          <RequestSummary request={request} />
          {request.status === "On the way" && <><button type="button" onClick={() => openDirections(request)} className="mt-3 block min-h-11 w-full rounded-md border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">Navigate</button><button type="button" disabled={busyId === request.id} onClick={() => void updateProgress(request.id, "ARRIVED")} className="mt-2 block min-h-11 w-full rounded-md bg-green-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busyId === request.id ? "Updating…" : "Mark arrived"}</button></>}
          {request.status === "Arrived" && <button type="button" disabled={busyId === request.id} onClick={() => void updateProgress(request.id, "START")} className="mt-3 block min-h-11 w-full rounded-md bg-green-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busyId === request.id ? "Updating…" : "Start job"}</button>}
          {request.status === "Collecting" && <button type="button" disabled={busyId === request.id} onClick={() => { setPausingRequestId(request.id); setDelayCode("OTHER"); setDelayExplanation(""); setError(""); }} className="mt-3 block min-h-11 w-full rounded-md border border-amber-400 px-4 py-3 text-sm font-semibold text-amber-900 disabled:opacity-50">Pause job</button>}
          {request.status === "Paused" && <button type="button" disabled={busyId === request.id} onClick={() => void updateProgress(request.id, "RESUME")} className="mt-3 block w-full rounded-md bg-green-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Resume collection</button>}
          {request.status === "Collecting" && <form onSubmit={(event) => void recordCollection(event, request)} className="mt-4 space-y-3 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Close task</h3>
            {linesFor(request).map((line, index) => <div key={`${request.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
              <label className="min-w-0 text-xs font-medium text-gray-700">Material
                <select required value={line.materialId} onChange={(event) => setWeights((current) => ({ ...current, [request.id]: linesFor(request).map((item, itemIndex) => itemIndex === index ? { ...item, materialId: event.target.value } : item) }))} className="mt-1 block min-h-10 w-full rounded-md border border-gray-300 bg-white px-2 text-sm">
                  {(availableMaterials.length ? availableMaterials : [{ id: request.materialId, name: request.material }]).map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">Weight (kg)<input required type="number" min="0" step="0.1" value={line.value} onChange={(event) => setWeights((current) => ({ ...current, [request.id]: linesFor(request).map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} className="mt-1 block min-h-10 w-full rounded-md border border-gray-300 px-2 text-sm" /></label>
              <button type="button" aria-label="Remove material" disabled={linesFor(request).length === 1} onClick={() => setWeights((current) => ({ ...current, [request.id]: linesFor(request).filter((_, itemIndex) => itemIndex !== index) }))} className="mb-1 min-h-9 min-w-9 text-lg font-semibold text-gray-600 disabled:opacity-30">×</button>
            </div>)}
            <button type="button" disabled={linesFor(request).length >= Math.max(1, availableMaterials.length)} onClick={() => {
              const currentLines = linesFor(request);
              const nextMaterial = availableMaterials.find((material) => !currentLines.some((line) => line.materialId === material.id));
              if (nextMaterial) setWeights((current) => ({ ...current, [request.id]: [...currentLines, { materialId: nextMaterial.id, value: "0" }] }));
            }} className="text-sm font-semibold text-green-800 underline disabled:opacity-40">Add material</button>
            <label className="block text-sm font-medium text-gray-800">Notes (optional)<textarea maxLength={1000} rows={2} value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
            <button type="submit" disabled={busyId === request.id} className="min-h-11 w-full rounded-md bg-green-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busyId === request.id ? "Saving…" : "Complete collection"}</button>
          </form>}
        </article>
      ))}
      {completedRequests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><StatusBadge status={request.status} /></div>
          <RequestSummary request={request} />
        </article>
      ))}
      {pausingRequestId && <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => { if (!busyId) setPausingRequestId(""); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="pause-job-title" className="w-full max-w-md rounded-md bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <h2 id="pause-job-title" className="font-display text-lg font-bold text-gray-900">Pause job</h2>
          <form onSubmit={(event) => { event.preventDefault(); void updateProgress(pausingRequestId, "PAUSE", { delayCode, explanation: delayExplanation.trim() || undefined }).then(() => setPausingRequestId("")).catch(() => {}); }} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-800">Delay reason<select required value={delayCode} onChange={(event) => setDelayCode(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5"><option value="VEHICLE_PROBLEM">Vehicle problem</option><option value="SAFETY_ISSUE">Safety issue</option><option value="SORTING_DELAY">Sorting delay</option><option value="CUSTOMER_DELAY">Customer delay</option><option value="OTHER">Other</option></select></label>
            <label className="block text-sm font-medium text-gray-800">Explanation (optional)<textarea maxLength={500} rows={3} value={delayExplanation} onChange={(event) => setDelayExplanation(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => setPausingRequestId("")} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={Boolean(busyId)} className="rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === pausingRequestId ? "Pausing…" : "Confirm pause"}</button></div>
          </form>
        </section>
      </div>}
    </WorkflowFrame>
  );
}

export function FacilityProfileScreen({ profile, onBack, onSave }: {
  profile: FacilityProfile | null;
  onBack: () => void;
  onSave: (profile: FacilityProfile) => Promise<void>;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [acceptedMaterials, setAcceptedMaterials] = useState(profile?.acceptedMaterials ?? []);
  const [openingHours, setOpeningHours] = useState(profile?.openingHours ?? weekdays.map(() => ""));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (acceptedMaterials.length === 0) {
      setError("Select at least one accepted material.");
      return;
    }
    if (!openingHours.some((hours) => hours.trim())) {
      setError("Add opening hours for at least one day.");
      return;
    }
    if (openingHours.some((hours) => hours && !/^(?:Closed|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/i.test(hours))) {
      setError("Use HH:MM-HH:MM for opening hours, or enter Closed.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), address: address.trim(), acceptedMaterials, openingHours });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this facility profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WorkflowFrame title={profile ? "Facility profile" : "Register facility"} description="Manage the facility details shown to the WasteWise community." onBack={onBack}>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-gray-800">Facility name
          <input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Address
          <input required minLength={5} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-800">Accepted materials</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {materials.slice(1).map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <input type="checkbox" checked={acceptedMaterials.includes(item)} onChange={(event) => setAcceptedMaterials((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} className="h-4 w-4 accent-green-700" />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-gray-800">Opening hours</legend>
          {weekdays.map((day, index) => (
            <label key={day} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-sm text-gray-700">
              <span>{day}</span>
              <input value={openingHours[index] ?? ""} onChange={(event) => setOpeningHours((current) => current.map((hours, hourIndex) => hourIndex === index ? event.target.value : hours))} className="min-w-0 rounded-lg border border-gray-300 px-3 py-2" placeholder="Closed or 08:00-17:00" />
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {saved && <p role="status" className="text-sm font-medium text-green-700">Facility profile saved.</p>}
        <button type="submit" disabled={isSaving} className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{isSaving ? "Saving…" : "Save facility profile"}</button>
      </form>
    </WorkflowFrame>
  );
}

export function FacilityVerificationScreen({ requests, profile, onBack, onVerify }: {
  requests: CollectionRequest[];
  profile: FacilityProfile | null;
  onBack: () => void;
  onVerify: (requestId: string, input: { materials: Array<{ materialId: string; verifiedKg: number }> }) => Promise<void>;
}) {
  const [weights, setWeights] = useState<Record<string, Array<{ materialId: string; material: string; value: string }>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const eligible = profile
    ? requests.filter((request) => request.status === "Collected" && (request.materialWeights.length ? request.materialWeights.every((item) => profile.acceptedMaterials.includes(item.material)) : profile.acceptedMaterials.includes(request.material)))
    : [];
  const linesFor = (request: CollectionRequest) => weights[request.id] ?? (request.materialWeights.length
    ? request.materialWeights.map((item) => ({ materialId: item.materialId, material: item.material, value: String(item.actualKg) }))
    : [{ materialId: request.materialId, material: request.material, value: String(request.collectedWeightKg ?? request.estimatedWeightKg) }]);

  return (
    <WorkflowFrame title="Verify received materials" description="Confirm quantities for materials accepted by your facility." onBack={onBack}>
      {!profile && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Register your facility and accepted materials before verifying deliveries.</p>}
      {profile && eligible.length === 0 && <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">No collected requests for your accepted materials are waiting for verification.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm font-medium text-green-700">{message}</p>}
      {eligible.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} delivery</h2><StatusBadge status={request.status} /></div>
          <p className="mt-2 text-sm text-gray-600">Collected by {request.collectorName ?? "collector"} for {request.recyclerName}</p>
          <RequestSummary request={request} />
          <form onSubmit={(event) => {
            event.preventDefault();
            const verifiedMaterials = linesFor(request).map((item) => ({ materialId: item.materialId, verifiedKg: Number(item.value) }));
            if (verifiedMaterials.some((item) => !Number.isFinite(item.verifiedKg) || item.verifiedKg < 0) || verifiedMaterials.reduce((total, item) => total + item.verifiedKg, 0) <= 0) { setError("Enter valid material weights with a positive total."); return; }
            const total = verifiedMaterials.reduce((sum, item) => sum + item.verifiedKg, 0);
            setBusyId(request.id);
            setError("");
            void onVerify(request.id, { materials: verifiedMaterials }).then(() => setMessage(`Verified ${total.toFixed(1)} kg across ${verifiedMaterials.length} materials.`)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not verify the received quantity.")).finally(() => setBusyId(""));
          }} className="mt-4 space-y-3 border-t border-gray-200 pt-4">
            {linesFor(request).map((item, index) => <label key={item.materialId} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 text-sm font-medium text-gray-800">{item.material}
              <input required type="number" min="0" step="0.1" value={item.value} onChange={(event) => setWeights((current) => ({ ...current, [request.id]: linesFor(request).map((line, lineIndex) => lineIndex === index ? { ...line, value: event.target.value } : line) }))} className="block w-full rounded-md border border-gray-300 px-3 py-2.5" />
            </label>)}
            <button type="submit" disabled={busyId === request.id} className="min-h-11 w-full rounded-md bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-50">{busyId === request.id ? "Verifying…" : "Verify materials"}</button>
          </form>
        </article>
      ))}
    </WorkflowFrame>
  );
}

type FacilityProfileDraft = {
  facilityId: string;
  name: string;
  address: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  latitude: string;
  longitude: string;
  acceptedMaterials: string[];
  openingHours: string[];
};

export type FacilityProfileSaveInput = {
  facilityId: string;
  name: string;
  address: string;
  description: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number;
  longitude: number;
  acceptedMaterials: string[];
  openingHours: string[];
};

const facilityTabs = ["Overview", "Collections", "Capacity", "Profile", "Incidents", "Analytics"] as const;
type FacilityTab = (typeof facilityTabs)[number];

function facilityDraft(profile: FacilityProfileRecord): FacilityProfileDraft {
  return {
    facilityId: profile.id,
    name: profile.name,
    address: profile.address,
    description: profile.description ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    latitude: String(profile.latitude),
    longitude: String(profile.longitude),
    acceptedMaterials: profile.acceptedMaterials,
    openingHours: Array.from({ length: 7 }, (_, index) => {
      const hour = profile.openingHours.find((item) => item.dayOfWeek === index);
      return !hour || hour.isClosed ? "Closed" : `${hour.opensAt ?? ""}-${hour.closesAt ?? ""}`;
    }),
  };
}

export function FacilityOperationsScreen({ dashboard, selectedFacilityId, onSelectFacility, onRefresh, onSaveProfile, onUpdateStatus, onUpdateCapacity, onReceive, onVerify, onReject, onReport, onMarkNotificationRead, onOpenMap }: {
  dashboard: FacilityOperationsDashboard | null;
  selectedFacilityId: string;
  onSelectFacility: (facilityId: string) => void;
  onRefresh: () => Promise<void>;
  onSaveProfile: (input: FacilityProfileSaveInput) => Promise<void>;
  onUpdateStatus: (status: "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED") => Promise<void>;
  onUpdateCapacity: (materials: Array<{ materialId: string; capacityKg: number | null; currentKg: number }>) => Promise<void>;
  onReceive: (requestId: string, input: { receivedKg: number; condition: "ACCEPTABLE" | "CONTAMINATED" | "WRONG_MATERIAL" | "DAMAGED" | "OTHER"; notes?: string }) => Promise<void>;
  onVerify: (requestId: string, input: { materials: Array<{ materialId: string; verifiedKg: number }> }) => Promise<void>;
  onReject: (requestId: string, input: { reasonCode: "WRONG_MATERIAL" | "CONTAMINATED" | "FACILITY_FULL" | "UNSUPPORTED_MATERIAL" | "OTHER"; notes?: string }) => Promise<void>;
  onReport: (input: { type: "EQUIPMENT_ISSUE" | "CAPACITY_PROBLEM" | "COLLECTION_PROBLEM" | "SAFETY_ISSUE" | "INCORRECT_MATERIAL" | "OTHER"; description: string }) => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onOpenMap: (location: Location) => void;
}) {
  const [tab, setTab] = useState<FacilityTab>("Overview");
  const [draft, setDraft] = useState<FacilityProfileDraft | null>(dashboard?.facility ? facilityDraft(dashboard.facility) : null);
  const [capacityDraft, setCapacityDraft] = useState<Record<string, string>>(() => Object.fromEntries((dashboard?.facility?.materials ?? []).map((item) => [item.id, item.capacityKg === null ? "" : String(item.capacityKg)])));
  const initializedFacilityId = useRef("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receivedRequest, setReceivedRequest] = useState("");
  const [verifiedValues, setVerifiedValues] = useState<Record<string, Record<string, string>>>({});
  const [rejectedRequest, setRejectedRequest] = useState("");
  const [rejectReason, setRejectReason] = useState<"WRONG_MATERIAL" | "CONTAMINATED" | "FACILITY_FULL" | "UNSUPPORTED_MATERIAL" | "OTHER">("WRONG_MATERIAL");
  const [rejectNotes, setRejectNotes] = useState("");
  const [receiptKg, setReceiptKg] = useState("");
  const [receiptCondition, setReceiptCondition] = useState<"ACCEPTABLE" | "CONTAMINATED" | "WRONG_MATERIAL" | "DAMAGED" | "OTHER">("ACCEPTABLE");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [reportType, setReportType] = useState<"EQUIPMENT_ISSUE" | "CAPACITY_PROBLEM" | "COLLECTION_PROBLEM" | "SAFETY_ISSUE" | "INCORRECT_MATERIAL" | "OTHER">("EQUIPMENT_ISSUE");
  const [reportDescription, setReportDescription] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [collectorFilter, setCollectorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const facility = dashboard?.facility ?? null;
  const isManager = facility?.membershipRole === "OWNER" || facility?.membershipRole === "MANAGER";

  useEffect(() => {
    if (!facility || initializedFacilityId.current === facility.id) return;
    initializedFacilityId.current = facility.id;
    setDraft(facilityDraft(facility));
    setCapacityDraft(Object.fromEntries(facility.materials.map((item) => [item.id, item.capacityKg === null ? "" : String(item.capacityKg)])));
  }, [facility]);

  const perform = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The facility update could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const collectionRows = dashboard?.collections ?? [];
  const visibleCollections = collectionRows.filter((request) => {
    const collectorName = request.assignments[0]?.collector.user.recyclerProfile?.displayName ?? request.assignments[0]?.collector.user.email ?? "";
    if (dateFilter && !request.requestedFor.startsWith(dateFilter)) return false;
    if (materialFilter && request.material.name !== materialFilter) return false;
    if (collectorFilter && !collectorName.toLowerCase().includes(collectorFilter.toLowerCase())) return false;
    if (statusFilter && request.status !== statusFilter) return false;
    return true;
  });
  const managerOnly = !isManager && facility ? "Only an owner or manager can change this setting." : "";

  return (
    <WorkflowFrame title={facility?.name ?? "Facility operations"} description={facility?.address ?? "Choose a facility to view operations."}>
      <div className="space-y-5">
        {dashboard?.facilities && dashboard.facilities.length > 1 && <label className="block max-w-md text-sm font-medium text-gray-800">Facility
          <select value={selectedFacilityId} onChange={(event) => onSelectFacility(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2.5">
            {dashboard.facilities.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.membershipRole.toLowerCase()}</option>)}
          </select>
        </label>}
        {!facility && <div className="border-y border-gray-200 bg-white p-5 text-sm text-gray-600">Select a facility membership to load its operations.</div>}
        {facility && <>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
            <div><p className="text-xs font-semibold uppercase text-gray-500">Facility status</p><p className="mt-1 text-lg font-bold text-gray-950">{facility.operationalStatus.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-gray-600">{facility.approvalStatus}{facility.isSuspended ? " · SUSPENDED" : ""} · {facility.membershipRole}</p></div>
            {isManager && <label className="text-sm font-medium text-gray-700">Operating status
              <select value={facility.operationalStatus === "NEAR_CAPACITY" || facility.operationalStatus === "FULL" ? "OPEN" : facility.operationalStatus} onChange={(event) => void perform(() => onUpdateStatus(event.target.value as "OPEN" | "CLOSED" | "TEMPORARILY_CLOSED"), "Facility status updated.")} disabled={busy} className="ml-2 rounded-md border border-gray-300 bg-white px-3 py-2">
                <option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="TEMPORARILY_CLOSED">Temporarily closed</option>
              </select>
            </label>}
          </header>
          <div role="tablist" aria-label="Facility operations" className="flex gap-1 overflow-x-auto border-b border-gray-200">
            {facilityTabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-10 shrink-0 border-b-2 px-3 text-xs font-semibold ${tab === item ? "border-green-800 text-green-900" : "border-transparent text-gray-600"}`}>{item}</button>)}
          </div>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}

          {tab === "Overview" && <>
            <section aria-label="Today's operations" className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-gray-200 pb-5 sm:grid-cols-4">
              <div><p className="text-xs text-gray-500">Today&apos;s received</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{dashboard?.summary?.todayReceivedKg.toFixed(1) ?? "—"} kg</p></div>
              <div><p className="text-xs text-gray-500">Incoming today</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{dashboard?.summary?.todayIncomingCollections ?? "—"}</p></div>
              <div><p className="text-xs text-gray-500">Pending deliveries</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{dashboard?.summary?.pendingDeliveries ?? "—"}</p></div>
              <div><p className="text-xs text-gray-500">Capacity usage</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{dashboard?.summary ? `${Math.round(dashboard.summary.capacityUsagePercent)}%` : "—"}</p></div>
            </section>
            <section><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-gray-900">Incoming collections</h2><button type="button" onClick={() => setTab("Collections")} className="text-xs font-semibold text-green-800">View history</button></div>
              {collectionRows.filter((request) => !["VERIFIED", "COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)).slice(0, 5).map((request) => <FacilityCollectionRow key={request.id} request={request} onReceive={() => { setReceivedRequest(request.id); setReceiptKg(String(request.weight?.estimatedKg ?? request.estimatedKg)); }} onReject={() => setRejectedRequest(request.id)} onVerify={onVerify} verifiedValues={verifiedValues} setVerifiedValues={setVerifiedValues} />)}
              {!collectionRows.some((request) => !["VERIFIED", "COMPLETED", "CANCELLED", "REJECTED"].includes(request.status)) && <p className="mt-3 text-sm text-gray-600">No incoming deliveries right now.</p>}
            </section>
            <section className="border-t border-gray-200 pt-4"><h2 className="text-sm font-bold text-gray-900">Notifications</h2>
              {(dashboard?.notifications ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-600">No facility notifications.</p> : dashboard?.notifications.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 border-b border-gray-100 py-3"><div><p className="text-sm font-semibold text-gray-900">{item.title}</p><p className="mt-1 text-xs text-gray-600">{item.body}</p></div>{!item.readAt && <button type="button" onClick={() => void perform(() => onMarkNotificationRead(item.id), "Notification marked as read.")} className="shrink-0 text-xs font-semibold text-green-800">Mark read</button>}</div>)}
            </section>
          </>}

          {tab === "Collections" && <>
            <div className="grid gap-2 sm:grid-cols-4">
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by date" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <select value={materialFilter} onChange={(event) => setMaterialFilter(event.target.value)} aria-label="Filter by material" className="rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">All materials</option>{Array.from(new Set(collectionRows.map((row) => row.material.name))).map((name) => <option key={name}>{name}</option>)}</select>
              <input value={collectorFilter} onChange={(event) => setCollectorFilter(event.target.value)} placeholder="Collector" aria-label="Filter by collector" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">All statuses</option>{Array.from(new Set(collectionRows.map((row) => row.status))).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
            </div>
            {visibleCollections.length ? visibleCollections.map((request) => <FacilityCollectionRow key={request.id} request={request} onReceive={() => { setReceivedRequest(request.id); setReceiptKg(String(request.weight?.estimatedKg ?? request.estimatedKg)); }} onReject={() => setRejectedRequest(request.id)} onVerify={onVerify} verifiedValues={verifiedValues} setVerifiedValues={setVerifiedValues} />) : <p className="border-y border-gray-200 bg-white p-4 text-sm text-gray-600">No collections match these filters.</p>}
          </>}

          {tab === "Capacity" && <section className="space-y-4">
            <p className="text-sm text-gray-600">Capacity thresholds: 80% warning, 95% critical. Current stock increases when recycling is verified.</p>
            {dashboard?.capacity.map((item) => <div key={item.materialId} className="grid gap-2 border-b border-gray-200 pb-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:items-end"><div><p className="font-semibold text-gray-900">{item.material}</p><p className="text-xs text-gray-600">{item.currentKg.toFixed(1)} kg / {item.capacityKg === null ? "No limit" : `${item.capacityKg.toFixed(1)} kg`} · {item.percentage === null ? "Unconfigured" : `${Math.round(item.percentage)}%`} · {item.level.replaceAll("_", " ")}</p><div className="mt-2 h-2 bg-gray-100"><div className={`h-2 ${item.level === "CRITICAL" ? "bg-rose-600" : item.level === "NEAR_CAPACITY" ? "bg-amber-500" : "bg-green-700"}`} style={{ width: `${Math.min(100, item.percentage ?? 0)}%` }} /></div></div>
              <label className="text-xs font-medium text-gray-600">Capacity kg<input type="number" min="0.1" step="0.1" value={capacityDraft[item.materialId] ?? ""} onChange={(event) => setCapacityDraft((current) => ({ ...current, [item.materialId]: event.target.value }))} disabled={!isManager} className="mt-1 block w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm" /></label>
              <span className="text-xs text-gray-500">{managerOnly}</span>
            </div>)}
            {isManager && <button type="button" disabled={busy} onClick={() => void perform(() => onUpdateCapacity((dashboard?.capacity ?? []).map((item) => ({ materialId: item.materialId, capacityKg: capacityDraft[item.materialId] ? Number(capacityDraft[item.materialId]) : null, currentKg: item.currentKg }))), "Capacity saved.")} className="rounded-md bg-green-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save capacity</button>}
          </section>}

          {tab === "Profile" && draft && <form onSubmit={(event) => { event.preventDefault(); if (!draft.acceptedMaterials.length) { setError("Select at least one accepted material."); return; } void perform(async () => { await onSaveProfile({ ...draft, latitude: Number(draft.latitude), longitude: Number(draft.longitude) }); setProfileSaved(true); }, "Facility profile saved."); }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[ ["Facility name", "name"], ["Address", "address"], ["Phone", "phone"], ["Email", "email"], ["Website", "website"], ["Latitude", "latitude"], ["Longitude", "longitude"] ].map(([label, key]) => <label key={key} className="text-sm font-medium text-gray-800">{label}<input required={key === "name" || key === "address"} type={key === "email" ? "email" : key === "latitude" || key === "longitude" ? "number" : "text"} step={key === "latitude" || key === "longitude" ? "any" : undefined} value={draft[key as keyof FacilityProfileDraft] as string} onChange={(event) => setDraft((current) => current ? { ...current, [key]: event.target.value } : current)} disabled={!isManager} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>)}
            </div>
            <label className="block text-sm font-medium text-gray-800">Description<textarea rows={3} maxLength={2000} value={draft.description} onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)} disabled={!isManager} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
            <button type="button" onClick={() => onOpenMap({ facilityId: facility.id, name: facility.name, shortAddress: facility.address, fullAddress: facility.address, accepted: facility.acceptedMaterials, status: facility.operationalStatus === "CLOSED" || facility.operationalStatus === "TEMPORARILY_CLOSED" || facility.operationalStatus === "FULL" ? "Closed" : "Open", openUntil: "", hours: facility.openingHours.map((item) => item.isClosed ? "Closed" : `${item.opensAt ?? ""}-${item.closesAt ?? ""}`), phone: facility.phone ?? "", email: facility.email ?? "", distance: "", directions: "", image: "", latitude: facility.latitude, longitude: facility.longitude })} className="text-sm font-semibold text-green-800">View current location on map</button>
            <fieldset><legend className="mb-2 text-sm font-medium text-gray-800">Accepted materials</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[...materials.slice(1), "Other"].map((name) => <label key={name} className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm"><input type="checkbox" checked={draft.acceptedMaterials.some((item) => item.toLowerCase() === name.toLowerCase())} disabled={!isManager} onChange={(event) => setDraft((current) => current ? { ...current, acceptedMaterials: event.target.checked ? [...current.acceptedMaterials, name] : current.acceptedMaterials.filter((item) => item.toLowerCase() !== name.toLowerCase()) } : current)} className="accent-green-700" />{name}</label>)}</div></fieldset>
            <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium text-gray-800">Opening hours</legend>{weekdays.map((day, index) => <label key={day} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-sm"><span>{day}</span><input value={draft.openingHours[index] ?? "Closed"} disabled={!isManager} onChange={(event) => setDraft((current) => current ? { ...current, openingHours: current.openingHours.map((value, hourIndex) => index === hourIndex ? event.target.value : value) } : current)} placeholder="Closed or 08:00-17:00" className="min-w-0 rounded-md border border-gray-300 px-3 py-2" /></label>)}</fieldset>
            {isManager && <button type="submit" disabled={busy} className="rounded-md bg-green-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save facility profile</button>}
            {!isManager && <p className="text-xs text-gray-500">{managerOnly}</p>}
            {profileSaved && <p role="status" className="text-sm text-green-800">Profile saved.</p>}
          </form>}

          {tab === "Incidents" && <>
            <form onSubmit={(event) => { event.preventDefault(); if (reportDescription.trim().length < 10) { setError("Describe the issue in at least 10 characters."); return; } void perform(async () => { await onReport({ type: reportType, description: reportDescription.trim() }); setReportDescription(""); }, "Issue report submitted."); }} className="grid gap-3 border-b border-gray-200 pb-5 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
              <label className="text-sm font-medium text-gray-800">Issue type<select value={reportType} onChange={(event) => setReportType(event.target.value as typeof reportType)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5"><option value="EQUIPMENT_ISSUE">Equipment issue</option><option value="CAPACITY_PROBLEM">Capacity problem</option><option value="COLLECTION_PROBLEM">Collection problem</option><option value="SAFETY_ISSUE">Safety issue</option><option value="INCORRECT_MATERIAL">Incorrect material</option><option value="OTHER">Other</option></select></label>
              <label className="text-sm font-medium text-gray-800">Description<textarea required minLength={10} maxLength={3000} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} rows={2} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label>
              <button type="submit" disabled={busy} className="rounded-md bg-green-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Report issue</button>
            </form>
            <section><h2 className="text-sm font-bold text-gray-900">Recent reports and active capacity incidents</h2>
              {[...(dashboard?.reports ?? []).map((item) => ({ id: item.id, type: item.type, description: item.description, createdAt: item.createdAt, status: item.status })), ...(dashboard?.incidents ?? []).map((item) => ({ id: item.id, type: item.type, description: item.details ?? item.material?.name ?? "Capacity issue", createdAt: item.lastReportedAt, status: item.priority }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <article key={item.id} className="border-b border-gray-200 py-3"><div className="flex justify-between gap-3"><strong className="text-sm text-gray-900">{item.type.replaceAll("_", " ")}</strong><span className="text-xs font-semibold text-gray-600">{item.status}</span></div><p className="mt-1 text-sm text-gray-700">{item.description}</p><time className="mt-1 block text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</time></article>)}
              {!dashboard?.reports.length && !dashboard?.incidents.length && <p className="mt-3 text-sm text-gray-600">No facility issues have been reported.</p>}
            </section>
          </>}

          {tab === "Analytics" && <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-gray-200 pb-5 sm:grid-cols-3">
            {[ ["Total received", `${dashboard?.summary?.totalKgReceived.toFixed(1) ?? "—"} kg`], ["Collections received", String(dashboard?.summary?.collectionsReceived ?? "—")], ["Average daily intake · 30 days", `${dashboard?.summary?.averageDailyIntakeKg.toFixed(1) ?? "—"} kg`], ["Current capacity", `${Math.round(dashboard?.summary?.capacityUsagePercent ?? 0)}%`], ["Verified collections", String(dashboard?.summary?.verifiedCollectionCount ?? "—")] ].map(([label, value]) => <div key={label}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{value}</p></div>)}
            {dashboard?.summary?.materialTotals.map((item) => <div key={item.material}><p className="text-xs text-gray-500">{item.material}</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{item.verifiedKg.toFixed(1)} kg</p></div>)}
          </section>}
        </>}
      </div>
      {receivedRequest && <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => { if (!busy) setReceivedRequest(""); }}><section role="dialog" aria-modal="true" aria-labelledby="facility-receive-title" className="w-full max-w-md rounded-md bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><h2 id="facility-receive-title" className="text-lg font-bold text-gray-900">Receive collection</h2><p className="mt-1 text-sm text-gray-600">Material: {dashboard?.collections.find((item) => item.id === receivedRequest)?.material.name ?? "Collection material"}</p><form onSubmit={(event) => { event.preventDefault(); const receivedKg = Number(receiptKg); if (!Number.isFinite(receivedKg) || receivedKg <= 0) { setError("Enter a positive received weight."); return; } void perform(async () => { await onReceive(receivedRequest, { receivedKg, condition: receiptCondition, ...(receiptNotes.trim() ? { notes: receiptNotes.trim() } : {}) }); setReceivedRequest(""); }, "Delivery marked as receiving."); }} className="mt-4 space-y-3"><label className="block text-sm">Received kg<input required type="number" min="0.1" step="0.1" value={receiptKg} onChange={(event) => setReceiptKg(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label><label className="block text-sm">Condition<select value={receiptCondition} onChange={(event) => setReceiptCondition(event.target.value as typeof receiptCondition)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5"><option value="ACCEPTABLE">Acceptable</option><option value="CONTAMINATED">Contaminated</option><option value="WRONG_MATERIAL">Wrong material</option><option value="DAMAGED">Damaged</option><option value="OTHER">Other</option></select></label><label className="block text-sm">Notes<textarea maxLength={1000} rows={3} value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setReceivedRequest("")} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-md bg-green-800 px-3 py-2 text-sm font-semibold text-white">Receive</button></div></form></section></div>}
      {rejectedRequest && <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => { if (!busy) setRejectedRequest(""); }}><section role="dialog" aria-modal="true" aria-labelledby="facility-reject-title" className="w-full max-w-md rounded-md bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><h2 id="facility-reject-title" className="text-lg font-bold text-gray-900">Reject material</h2><form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await onReject(rejectedRequest, { reasonCode: rejectReason, ...(rejectNotes.trim() ? { notes: rejectNotes.trim() } : {}) }); setRejectedRequest(""); setRejectNotes(""); }, "Delivery rejected and relevant users notified."); }} className="mt-4 space-y-3"><label className="block text-sm">Reason<select required value={rejectReason} onChange={(event) => setRejectReason(event.target.value as typeof rejectReason)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5"><option value="WRONG_MATERIAL">Wrong material</option><option value="CONTAMINATED">Contaminated</option><option value="FACILITY_FULL">Facility full</option><option value="UNSUPPORTED_MATERIAL">Unsupported material</option><option value="OTHER">Other</option></select></label><label className="block text-sm">Details<textarea maxLength={1000} rows={3} value={rejectNotes} onChange={(event) => setRejectNotes(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setRejectedRequest("")} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white">Confirm rejection</button></div></form></section></div>}
    </WorkflowFrame>
  );
}

function FacilityCollectionRow({ request, onReceive, onReject, onVerify, verifiedValues, setVerifiedValues }: {
  request: CollectionRecord;
  onReceive: () => void;
  onReject: () => void;
  onVerify: (requestId: string, input: { materials: Array<{ materialId: string; verifiedKg: number }> }) => Promise<void>;
  verifiedValues: Record<string, Record<string, string>>;
  setVerifiedValues: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const collector = request.assignments[0]?.collector.user.recyclerProfile?.displayName ?? request.assignments[0]?.collector.user.email ?? "Not assigned";
  const lines = request.materialWeights?.length ? request.materialWeights.map((item) => ({ materialId: item.materialId, material: item.material.name, actualKg: Number(item.actualKg) })) : [{ materialId: request.material.id, material: request.material.name, actualKg: Number(request.weight?.actualKg ?? request.estimatedKg) }];
  const canReceive = request.status === "COLLECTOR_ARRIVED";
  const canVerify = request.status === "VERIFICATION_PENDING";
  const canReject = canReceive || request.status === "COLLECTING" || canVerify;
  return <article className="border-b border-gray-200 py-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-gray-900">COL-{request.id.slice(-6).toUpperCase()}</h3><p className="mt-1 text-xs text-gray-500">{new Date(request.requestedFor).toLocaleString()} · {collector}</p></div><span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">{request.status.replaceAll("_", " ")}</span></div>
    <div className="mt-2 grid gap-1 text-sm text-gray-700 sm:grid-cols-2"><p>{request.material.name} · {Number(request.estimatedKg).toFixed(1)} kg estimated</p><p>Collector recorded: {request.weight?.actualKg == null ? "Pending" : `${Number(request.weight.actualKg).toFixed(1)} kg`}</p><p>Facility received: {request.weight?.facilityReceivedKg == null ? "Not recorded" : `${Number(request.weight.facilityReceivedKg).toFixed(1)} kg`}</p><p>Facility verified: {request.weight?.verifiedKg == null ? "Pending" : `${Number(request.weight.verifiedKg).toFixed(1)} kg`}</p>{request.weight?.verifiedKg != null && request.weight.actualKg != null && <p>Difference: {(Number(request.weight.actualKg) - Number(request.weight.verifiedKg)).toFixed(1)} kg</p>}{request.weight?.verifiedBy && <p>Verified by {request.weight.verifiedBy.email}{request.weight.verifiedAt ? ` · ${new Date(request.weight.verifiedAt).toLocaleString()}` : ""}</p>}{request.weight?.facilityCondition && <p>Condition: {request.weight.facilityCondition.replaceAll("_", " ")}</p>}{request.estimatedEtaMinutes != null && <p>Approx. collector ETA: {request.estimatedEtaMinutes} min</p>}</div>
    {canVerify && <form onSubmit={(event) => { event.preventDefault(); const values = lines.map((line) => ({ materialId: line.materialId, verifiedKg: Number(verifiedValues[request.id]?.[line.materialId] ?? line.actualKg) })); if (values.some((item) => !Number.isFinite(item.verifiedKg) || item.verifiedKg < 0) || values.reduce((sum, item) => sum + item.verifiedKg, 0) <= 0) { setError("Enter valid positive verified material weights."); return; } setBusy(true); setError(""); void onVerify(request.id, { materials: values }).then(() => setMessage("Recycling confirmed and weight verified.")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not verify this delivery.")).finally(() => setBusy(false)); }} className="mt-3 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid gap-2 sm:grid-cols-2">{lines.map((line) => <label key={line.materialId} className="text-xs font-medium text-gray-700">{line.material} · collector {line.actualKg.toFixed(1)} kg<input required type="number" min="0" max={line.actualKg} step="0.1" value={verifiedValues[request.id]?.[line.materialId] ?? String(line.actualKg)} onChange={(event) => setVerifiedValues((current) => ({ ...current, [request.id]: { ...current[request.id], [line.materialId]: event.target.value } }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" /></label>)}</div>
      <button type="submit" disabled={busy} className="self-end rounded-md bg-green-800 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify & confirm recycling"}</button>
    </form>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-xs text-green-800">{message}</p>}
    {(canReceive || canReject) && <div className="mt-3 flex flex-wrap gap-2">{canReceive && <button type="button" onClick={onReceive} className="rounded-md bg-green-800 px-3 py-2 text-sm font-semibold text-white">Receive collection</button>}{canReject && <button type="button" onClick={onReject} className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800">Reject material</button>}</div>}
  </article>;
}

function PriorityBadge({ priority }: { priority: CollectionPriority }) {
  const colors: Record<CollectionPriority, string> = {
    LOW: "bg-gray-100 text-gray-700",
    MEDIUM: "bg-blue-100 text-blue-800",
    HIGH: "bg-orange-100 text-orange-900",
    CRITICAL: "bg-rose-700 text-white",
  };
  return <span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase ${colors[priority]}`}>{priority}</span>;
}

export function CollectorDashboardScreen({ displayName, dashboard, requests, onSetAvailability, onSaveQualifications, onOpenRequests, onOpenPickups, onOpenHistory, onMarkNotificationRead }: {
  displayName: string;
  dashboard: CollectorDashboard | null;
  requests: CollectionRequest[];
  onSetAvailability: (availability: "AVAILABLE" | "ON_COLLECTION" | "OFFLINE" | "UNAVAILABLE") => Promise<void>;
  onSaveQualifications: (materialIds: string[]) => Promise<void>;
  onOpenRequests: () => void;
  onOpenPickups: () => void;
  onOpenHistory: () => void;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
}) {
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [qualificationBusy, setQualificationBusy] = useState(false);
  const [error, setError] = useState("");
  const [materialDraft, setMaterialDraft] = useState<string[] | null>(null);
  const selectedMaterials = materialDraft ?? dashboard?.profile.qualifiedMaterialIds ?? [];
  const performance = dashboard?.performance;
  const activeRequest = requests.find((request) => request.id === dashboard?.activeRequestId);
  const pendingCount = requests.filter((request) => request.assignmentStatus === "ASSIGNED").length;
  const availability = dashboard?.profile.availability;
  const availabilityLabel = availability === "ON_COLLECTION" ? "BUSY" : availability === "AVAILABLE" ? "ONLINE" : availability ?? "OFFLINE";

  const saveAvailability = async (next: "AVAILABLE" | "ON_COLLECTION" | "OFFLINE" | "UNAVAILABLE") => {
    setAvailabilityBusy(true);
    setError("");
    try {
      await onSetAvailability(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update availability.");
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const saveQualifications = async () => {
    setQualificationBusy(true);
    setError("");
    try {
      await onSaveQualifications(selectedMaterials);
      setMaterialDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save material qualifications.");
    } finally {
      setQualificationBusy(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-24">
      <header className="bg-green-700 px-5 pb-6 pt-7 text-white">
        <p className="text-sm font-medium text-green-100">Hello, {displayName}</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div><h1 className="font-display text-2xl font-extrabold">Collection dashboard</h1><p className="mt-1 text-sm text-green-100">Your jobs and field performance</p></div>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${availabilityLabel === "ONLINE" ? "bg-green-200 text-green-950" : availabilityLabel === "BUSY" ? "bg-amber-200 text-amber-950" : "bg-white/15 text-white"}`}>{availabilityLabel}</span>
        </div>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section aria-label="Availability" className="border-b border-gray-200 pb-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold text-gray-900">Availability</h2><span className="text-xs text-gray-500">Saved to your profile</span></div>
          <div className="grid grid-cols-4 gap-1 rounded-md bg-gray-200 p-1">
            {([ ["AVAILABLE", "Online"], ["ON_COLLECTION", "Busy"], ["OFFLINE", "Offline"], ["UNAVAILABLE", "Unavailable"] ] as const).map(([value, label]) => (
              <button key={value} type="button" disabled={availabilityBusy || dashboard?.profile.approvalStatus !== "APPROVED"} aria-pressed={availability === value} onClick={() => void saveAvailability(value)} className={`min-h-10 rounded px-2 text-xs font-semibold disabled:opacity-50 ${availability === value ? "bg-white text-gray-950 shadow-sm" : "text-gray-700"}`}>{label}</button>
            ))}
          </div>
          {dashboard?.profile.approvalStatus !== "APPROVED" && <p className="mt-2 text-xs text-amber-800">Your account must be approved before you can go online.</p>}
        </section>

        <section aria-label="Collection overview" className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-gray-200 pb-5">
          <div><p className="text-xs text-gray-500">Pending jobs</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{pendingCount}</p></div>
          <div><p className="text-xs text-gray-500">Completed</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.completedCollections ?? "—"}</p></div>
          <div><p className="text-xs text-gray-500">Today collected</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance ? `${performance.todayCollectedKg.toFixed(1)} kg` : "—"}</p></div>
          <div><p className="text-xs text-gray-500">Total collected</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance ? `${performance.totalCollectedKg.toFixed(1)} kg` : "—"}</p></div>
          <div><p className="text-xs text-gray-500">Avg. response</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.averageResponseTimeMinutes == null ? "—" : `${performance.averageResponseTimeMinutes} min`}</p></div>
          <div><p className="text-xs text-gray-500">Avg. collection</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.averageCollectionDurationMinutes == null ? "—" : `${performance.averageCollectionDurationMinutes} min`}</p></div>
        </section>

        <section aria-label="Current job" className="border-b border-gray-200 pb-5">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold text-gray-900">Current job</h2><button type="button" onClick={onOpenPickups} className="text-xs font-semibold text-green-800 underline">View job</button></div>
          {activeRequest ? <article className={`rounded-md border p-3 ${activeRequest.priority === "CRITICAL" ? "border-rose-400 bg-rose-50" : activeRequest.priority === "HIGH" ? "border-orange-300 bg-orange-50" : "border-gray-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-3"><strong className="text-sm text-gray-950">COL-{activeRequest.id.slice(-4).toUpperCase()}</strong><PriorityBadge priority={activeRequest.priority} /></div>
            <p className="mt-2 text-sm font-semibold text-gray-800">{activeRequest.material} · {activeRequest.estimatedWeightKg.toFixed(1)} kg estimated</p>
            <p className="mt-1 text-xs text-gray-600">{activeRequest.pickupAddress}</p>
          </article> : <p className="text-sm text-gray-600">No active job.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={onOpenRequests} className="min-h-11 rounded-md bg-green-800 px-3 py-2 text-sm font-semibold text-white">Open request queue</button><button type="button" onClick={onOpenHistory} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800">History &amp; performance</button></div>
        </section>

        <section aria-label="Material qualifications" className="border-b border-gray-200 pb-5">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold text-gray-900">Qualified materials</h2><button type="button" disabled={qualificationBusy || !dashboard} onClick={() => void saveQualifications()} className="text-xs font-semibold text-green-800 underline disabled:opacity-50">{qualificationBusy ? "Saving…" : "Save"}</button></div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {(dashboard?.materials ?? []).map((material) => <label key={material.id} className="flex min-h-9 items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={selectedMaterials.includes(material.id)} onChange={(event) => setMaterialDraft((current) => {
              const selected = current ?? dashboard?.profile.qualifiedMaterialIds ?? [];
              return event.target.checked ? [...selected, material.id] : selected.filter((id) => id !== material.id);
            })} className="h-4 w-4 accent-green-700" />{material.name}</label>)}
          </div>
          <p className="mt-2 text-xs text-gray-500">Only matching jobs can be assigned to you.</p>
        </section>

        <section aria-label="Recent notifications">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold text-gray-900">Notifications</h2><span className="text-xs text-gray-500">Refreshes every 3 seconds</span></div>
          {dashboard?.notifications.length ? dashboard.notifications.slice(0, 5).map((notification) => <div key={notification.id} className={`flex items-start justify-between gap-3 border-b border-gray-100 py-2 ${notification.readAt ? "" : "border-l-2 border-l-green-700 pl-2"}`}><div><p className="text-xs font-semibold text-gray-900">{notification.title}</p><p className="mt-0.5 text-xs text-gray-600">{notification.body}</p></div>{!notification.readAt && <button type="button" aria-label={`Mark ${notification.title} as read`} onClick={() => void onMarkNotificationRead(notification.id)} className="shrink-0 text-xs font-semibold text-green-800 underline">Read</button>}</div>) : <p className="text-sm text-gray-600">No new notifications.</p>}
        </section>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </div>
    </main>
  );
}

export function CollectorHistoryScreen({ requests, performance, onBack }: {
  requests: CollectionRequest[];
  performance: CollectorDashboard["performance"] | null;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "DECLINED" | "CANCELLED" | "PAUSED">("ALL");
  const isDeclined = (request: CollectionRequest) => request.assignmentStatus === "DECLINED";
  const isCancelled = (request: CollectionRequest) => request.assignmentStatus === "REVOKED" || request.status === "Cancelled";
  const wasPaused = (request: CollectionRequest) => request.status === "Paused" || request.statusEvents?.some((event) => event.toStatus === "PAUSED") === true;
  const isCompleted = (request: CollectionRequest) => request.assignmentStatus === "COMPLETED" || request.status === "Collected" || request.status === "Verified";
  const filters = [
    { value: "ALL", label: "All" },
    { value: "COMPLETED", label: "Completed" },
    { value: "DECLINED", label: "Declined" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "PAUSED", label: "Paused" },
  ] as const;
  const visibleRequests = requests.filter((request) => {
    if (filter === "COMPLETED") return isCompleted(request);
    if (filter === "DECLINED") return isDeclined(request);
    if (filter === "CANCELLED") return isCancelled(request);
    if (filter === "PAUSED") return wasPaused(request);
    return true;
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const statusFor = (request: CollectionRequest) => isDeclined(request) ? "Declined" : isCancelled(request) ? "Cancelled" : request.status === "Paused" ? "Paused" : isCompleted(request) ? "Completed" : request.status;
  const durationFor = (request: CollectionRequest) => {
    const start = request.statusEvents?.find((event) => event.toStatus === "COLLECTING");
    const end = request.statusEvents?.find((event) => event.toStatus === "VERIFICATION_PENDING");
    if (!start || !end || new Date(end.createdAt) < new Date(start.createdAt)) return "—";
    const minutes = Math.round((new Date(end.createdAt).getTime() - new Date(start.createdAt).getTime()) / 60000);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  };

  return (
    <WorkflowFrame title="History & performance" description="Your completed work, exceptions, and field metrics." onBack={onBack}>
      <section aria-label="Collector performance" className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-gray-200 pb-5">
        <div><p className="text-xs text-gray-500">Completed</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.completedCollections ?? "—"}</p></div>
        <div><p className="text-xs text-gray-500">Total collected</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance ? `${performance.totalCollectedKg.toFixed(1)} kg` : "—"}</p></div>
        <div><p className="text-xs text-gray-500">Avg. response</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.averageResponseTimeMinutes == null ? "—" : `${performance.averageResponseTimeMinutes} min`}</p></div>
        <div><p className="text-xs text-gray-500">Avg. collection</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.averageCollectionDurationMinutes == null ? "—" : `${performance.averageCollectionDurationMinutes} min`}</p></div>
        <div><p className="text-xs text-gray-500">Declined</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.declinedJobs ?? "—"}</p></div>
        <div><p className="text-xs text-gray-500">Cancelled</p><p className="mt-1 font-display text-xl font-extrabold text-gray-950">{performance?.cancelledJobs ?? "—"}</p></div>
      </section>
      <div role="tablist" aria-label="Filter collection history" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {filters.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={`min-h-10 shrink-0 border-b-2 px-3 text-xs font-semibold ${filter === item.value ? "border-green-800 text-green-900" : "border-transparent text-gray-600"}`}>{item.label}</button>)}
      </div>
      {visibleRequests.length === 0 ? <p className="border-y border-gray-200 bg-white p-5 text-sm text-gray-600">No jobs in this history view.</p> : visibleRequests.map((request) => {
        const totalWeight = request.materialWeights.length
          ? request.materialWeights.reduce((sum, item) => sum + item.actualKg, 0)
          : request.collectedWeightKg;
        const wasteTypes = request.materialWeights.length
          ? request.materialWeights.map((item) => item.material).join(", ")
          : request.material;
        return <article key={request.id} className="border-b border-gray-200 py-3">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-gray-900">COL-{request.id.slice(-4).toUpperCase()}</h2><p className="mt-1 text-xs text-gray-500">{new Date(request.createdAt).toLocaleString()}</p></div><span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">{statusFor(request)}</span></div>
          <p className="mt-2 text-sm text-gray-800">{wasteTypes}</p>
          <p className="mt-1 text-xs text-gray-600">{totalWeight == null ? "Weight not recorded" : `${totalWeight.toFixed(1)} kg`} · Duration {durationFor(request)}</p>
          {isDeclined(request) && <p className="mt-1 text-xs text-rose-800">Decline reason: {request.declineReasonCode?.replaceAll("_", " ").toLowerCase() ?? "Not recorded"}</p>}
          {wasPaused(request) && <p className="mt-1 text-xs text-amber-800">Pause event recorded</p>}
        </article>;
      })}
    </WorkflowFrame>
  );
}