"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { materials } from "./locations";
import { getAvailableFacilities, type AvailableFacility, type UserNotification } from "../lib/dashboard-api";

const CollectionTrackingMap = dynamic(() => import("./admin-collections-map").then((module) => module.CollectionTrackingMap), {
  ssr: false,
  loading: () => <div className="mt-3 grid h-[280px] place-items-center bg-gray-100 text-sm text-gray-500">Loading pickup map…</div>,
});

export type CollectionStatus = "Pending" | "Assigned" | "Collected" | "Verified";

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
  collectedWeightKg?: number;
  verifiedWeightKg?: number;
};

export type FacilityProfile = {
  name: string;
  address: string;
  acceptedMaterials: string[];
  openingHours: string[];
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const rewardOptions = [
  { name: "Reusable recycling bag", points: 75 },
  { name: "Community garden seed pack", points: 150 },
  { name: "Local transport voucher", points: 300 },
];

function WorkflowFrame({ title, description, onBack, children }: {
  title: string;
  description: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-24">
      <header className="border-b border-gray-100 bg-white px-5 py-5">
        <button type="button" onClick={onBack} className="mb-3 text-sm font-semibold text-green-700 hover:text-green-800">← Dashboard</button>
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
    Collected: "bg-teal-100 text-teal-800",
    Verified: "bg-green-100 text-green-800",
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
    </div>
  );
}

export function CollectionRequestScreen({ onBack, onCreate }: {
  onBack: () => void;
  onCreate: (request: { material: string; destinationFacilityId: string; estimatedKg: number; requestedFor: string; pickupAddress: string; pickupLatitude: number; pickupLongitude: number }) => Promise<void>;
}) {
  const [material, setMaterial] = useState(materials[1]);
  const [facilities, setFacilities] = useState<AvailableFacility[]>([]);
  const [destinationFacilityId, setDestinationFacilityId] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
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
      await onCreate({
        material,
        destinationFacilityId,
        pickupAddress: pickupAddress.trim(),
        estimatedKg: estimatedWeightKg,
        requestedFor: new Date(`${preferredDate}T12:00:00`).toISOString(),
        pickupLatitude,
        pickupLongitude,
      });
      setPickupAddress("");
      setEstimatedWeight("");
      setPreferredDate("");
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit collection request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WorkflowFrame title="Request a collection" description="Arrange a pickup for recyclable materials." onBack={onBack}>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
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
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-gray-800">Pickup coordinates</p><button type="button" onClick={useCurrentLocation} className="text-sm font-semibold text-green-700 underline">Use current location</button></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-gray-700">Latitude<input required type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-gray-700">Longitude<input required type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" /></label>
          </div>
          <p className="text-xs text-gray-500">Your location is used to match nearby collectors. Browser permission is optional; coordinates can be entered manually.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm font-medium text-green-700">Request submitted. You can track it from your dashboard.</p>}
        <button type="submit" disabled={isSubmitting || !facilities.length} className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Submitting…" : "Submit collection request"}</button>
      </form>
    </WorkflowFrame>
  );
}

export function TrackingScreen({ requests, points, rates, notifications, onBack, onRewards, onRefresh }: {
  requests: CollectionRequest[];
  points: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
  notifications: UserNotification[];
  onBack: () => void;
  onRewards: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      {requests.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">No collection requests yet. Submit a request to start tracking it here.</p>
      ) : requests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} collection</h2><StatusBadge status={request.status} /></div>
          <RequestSummary request={request} />
          {request.collectorName && <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">Collector assigned: <strong>{request.collectorName}</strong> · {request.collectorAccepted ? "Accepted and on the way" : "Waiting for the Collector to respond"}</p>}
          {request.collectorAccepted && request.status === "Assigned" && <>
            <p className="mt-2 text-sm text-gray-700">Approximate arrival: {request.estimatedEtaMinutes == null ? "Unavailable; no recent location" : `about ${request.estimatedEtaMinutes} minutes`}. This estimate uses a last-known location, not live routing.{request.collectorLocationUpdatedAt ? ` Updated ${new Date(request.collectorLocationUpdatedAt).toLocaleString()}.` : ""}</p>
            <CollectionTrackingMap request={request} />
          </>}
          <ol aria-label={`Status for ${request.material} collection`} className="mt-4 grid grid-cols-4 gap-1 text-center text-[10px] sm:text-xs">
            {(["Pending", "Assigned", "Collected", "Verified"] as const).map((status) => {
              const statuses: CollectionStatus[] = ["Pending", "Assigned", "Collected", "Verified"];
              const reached = statuses.indexOf(request.status) >= statuses.indexOf(status);
              return <li key={status} className={`rounded-md py-1.5 font-semibold ${reached ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{status}</li>;
            })}
          </ol>
        </article>
      ))}
      {notifications.length > 0 && <section className="space-y-2"><h2 className="font-display text-lg font-bold text-gray-900">Notifications</h2>{notifications.map((notification) => <article key={notification.id} className="rounded-lg border border-gray-200 bg-white p-3"><p className="font-semibold text-gray-900">{notification.title}</p><p className="mt-1 text-sm text-gray-600">{notification.body}</p><p className="mt-2 text-xs text-gray-500">{new Date(notification.createdAt).toLocaleString()}</p></article>)}</section>}
    </WorkflowFrame>
  );
}

export function RewardsScreen({ points, rates, redemptions, onBack, onRedeem, onElectricityRedeem }: {
  points: number;
  rates: Array<{ material: string; pointsPerKg: number }>;
  redemptions: Array<{ id: string; reference: string; type: "REWARD" | "ELECTRICITY"; pointsCost: number; valueCents: number; status: string; meterNumberMasked: string | null; createdAt: string }>;
  onBack: () => void;
  onRedeem: (cost: number) => Promise<void>;
  onElectricityRedeem: (cost: number, meterNumber: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [meterNumber, setMeterNumber] = useState("");
  const [electricityPoints, setElectricityPoints] = useState("");

  const redeem = async (name: string, cost: number) => {
    setIsRedeeming(true);
    try {
      await onRedeem(cost);
      setIsError(false);
      setFeedback(`${name} requested for ${cost} points. An Admin must approve the redemption.`);
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
      {rewardOptions.map((reward) => (
        <article key={reward.name} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div><h2 className="font-semibold text-gray-900">{reward.name}</h2><p className="mt-1 text-sm text-gray-500">{reward.points} points · mock reward</p></div>
          <button type="button" disabled={isRedeeming || points < reward.points} onClick={() => void redeem(reward.name, reward.points)} className="shrink-0 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300">{isRedeeming ? "Requesting…" : "Redeem"}</button>
        </article>
      ))}
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

export function CollectorBoardScreen({ requests, onBack, onAccept, onDecline }: {
  requests: CollectionRequest[];
  onBack: () => void;
  onAccept: (requestId: string) => Promise<void>;
  onDecline: (requestId: string, reason: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [decliningRequestId, setDecliningRequestId] = useState("");
  const [declineReason, setDeclineReason] = useState("");

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
    if (declineReason.trim().length < 5) {
      setError("Enter at least five characters explaining why you are declining.");
      return;
    }
    setBusyId(decliningRequestId);
    setError("");
    try {
      await onDecline(decliningRequestId, declineReason.trim());
      setDecliningRequestId("");
      setDeclineReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not decline this assignment.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <WorkflowFrame title="Collection assignments" description="Review requests assigned to you by an Admin and accept the pickup." onBack={onBack}>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {requests.length === 0 ? <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">You have no Admin-assigned pickups right now.</p> : requests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><StatusBadge status={request.status} /></div>
          <p className="mt-2 text-sm text-gray-600">Requested by {request.recyclerName}</p>
          <RequestSummary request={request} />
          {request.collectorAccepted ? <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">Accepted · pickup is in progress</p> : <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void accept(request.id)} className="rounded-lg bg-green-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{busyId === request.id ? "Accepting…" : "Accept"}</button><button type="button" disabled={busyId === request.id} onClick={() => { setDecliningRequestId(request.id); setDeclineReason(""); setError(""); }} className="rounded-lg border border-rose-300 px-3 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Decline</button></div>}
        </article>
      ))}
      {decliningRequestId && <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => { if (!busyId) setDecliningRequestId(""); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="decline-assignment-title" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <h2 id="decline-assignment-title" className="font-display text-lg font-bold text-gray-900">Decline assignment</h2>
          <p className="mt-1 text-sm text-gray-600">Tell the Admin why you cannot take this pickup. The reason is saved with the request.</p>
          <form onSubmit={(event) => void decline(event)} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-800">Reason
              <textarea required minLength={5} maxLength={500} rows={4} autoFocus value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5" />
            </label>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => setDecliningRequestId("")} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={Boolean(busyId) || declineReason.trim().length < 5} className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === decliningRequestId ? "Declining…" : "Confirm decline"}</button></div>
          </form>
        </section>
      </div>}
    </WorkflowFrame>
  );
}

export function CollectorPickupsScreen({ requests, onBack, onRecordCollection, onUpdateLocation }: {
  requests: CollectionRequest[];
  onBack: () => void;
  onRecordCollection: (requestId: string, collectedWeightKg: number) => Promise<void>;
  onUpdateLocation: (latitude: number, longitude: number) => Promise<void>;
}) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const assignedRequests = requests.filter((request) => request.status === "Assigned");
  const completedRequests = requests.filter((request) => request.status === "Collected" || request.status === "Verified");

  const openDirections = (address: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const recordCollection = async (event: FormEvent<HTMLFormElement>, requestId: string) => {
    event.preventDefault();
    const weight = Number(weights[requestId]);
    if (!Number.isFinite(weight) || weight <= 0) {
      setError("Enter a valid collected quantity.");
      return;
    }
    setBusyId(requestId);
    setError("");
    try {
      await onRecordCollection(requestId, weight);
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

  return (
    <WorkflowFrame title="My pickups" description="Navigate to pickup addresses and record materials collected." onBack={onBack}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Location is shared as a timestamped last-known point, not live tracking.</p><button type="button" disabled={isUpdatingLocation} onClick={updateLocation} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{isUpdatingLocation ? "Updating…" : "Update my location"}</button></div>
      {locationMessage && <p role="status" className="text-sm text-green-700">{locationMessage}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {assignedRequests.length === 0 && completedRequests.length === 0 && <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-600">You have no assigned pickups. Accept a request from the request board.</p>}
      {assignedRequests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><StatusBadge status={request.status} /></div>
          <RequestSummary request={request} />
          <button type="button" onClick={() => openDirections(request.pickupAddress)} className="mt-3 text-sm font-semibold text-green-700 hover:text-green-800">Get pickup directions ↗</button>
          <form onSubmit={(event) => void recordCollection(event, request.id)} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1 text-sm font-medium text-gray-800">Collected quantity (kg)
              <input required type="number" min="0.1" step="0.1" value={weights[request.id] ?? String(request.estimatedWeightKg)} onChange={(event) => setWeights((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
            </label>
            <button type="submit" disabled={busyId === request.id} className="self-end rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{busyId === request.id ? "Saving…" : "Mark collected"}</button>
          </form>
        </article>
      ))}
      {completedRequests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><h2 className="font-display font-bold text-gray-900">{request.material} pickup</h2><StatusBadge status={request.status} /></div>
          <RequestSummary request={request} />
        </article>
      ))}
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
  onVerify: (requestId: string, verifiedWeightKg: number) => Promise<void>;
}) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const eligible = profile
    ? requests.filter((request) => request.status === "Collected" && profile.acceptedMaterials.includes(request.material))
    : [];

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
          <form onSubmit={(event) => { event.preventDefault(); const weight = Number(weights[request.id] ?? request.collectedWeightKg); if (!Number.isFinite(weight) || weight <= 0) { setError("Enter a valid received quantity."); return; } setBusyId(request.id); setError(""); void onVerify(request.id, weight).then(() => setMessage(`Verified ${weight} kg of ${request.material}.`)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not verify the received quantity.")).finally(() => setBusyId("")); }} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm font-medium text-gray-800">Received quantity (kg)
              <input required type="number" min="0.1" step="0.1" value={weights[request.id] ?? String(request.collectedWeightKg ?? request.estimatedWeightKg)} onChange={(event) => setWeights((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
            </label>
            <button type="submit" disabled={busyId === request.id} className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{busyId === request.id ? "Verifying…" : "Verify quantity"}</button>
          </form>
        </article>
      ))}
    </WorkflowFrame>
  );
}