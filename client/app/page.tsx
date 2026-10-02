"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { locations, materials, type Location } from "./locations";
import { AuthApiError, getSession, login, logout, registerRecycler, type RegistrationInput, type UserRole } from "../lib/auth-api";
import {
  acceptCollection as acceptCollectionApi,
  createUserReport,
  createCollectionRequest as createCollectionRequestApi,
  getCollectionRequests,
  getFacilityProfile,
  getRecyclerRewards,
  recordCollectedWeight,
  requestRewardRedemption,
  saveFacilityProfile as saveFacilityProfileApi,
  updateCollectorLocation,
  verifyCollectedWeight,
  type CollectionRecord,
} from "../lib/dashboard-api";
import {
  CollectionRequestScreen,
  CollectorBoardScreen,
  CollectorPickupsScreen,
  FacilityProfileScreen,
  FacilityVerificationScreen,
  RewardsScreen,
  TrackingScreen,
  type CollectionRequest,
  type FacilityProfile,
} from "./workflow-screens";
type Screen = "auth" | "dashboard" | "admin" | "find" | "map" | "details" | "saved" | "report" | "collection-request" | "tracking" | "rewards" | "collector-board" | "collector-pickups" | "facility-profile" | "facility-verification";
type AuthMode = "login" | "signup";
type AuthSubmission = Omit<RegistrationInput, "displayName"> & { displayName?: string };

function toWorkflowCollection(record: CollectionRecord): CollectionRequest {
  const status = record.status === "VERIFIED" || record.status === "COMPLETED"
    ? "Verified"
    : record.status === "COLLECTED" || record.status === "VERIFICATION_PENDING"
      ? "Collected"
      : record.status === "WAITING_FOR_ADMIN" || record.status === "PENDING"
        ? "Pending"
        : "Assigned";
  const assignment = record.assignments[0];
  return {
    id: record.id,
    recyclerId: record.requesterId,
    recyclerName: record.requester?.recyclerProfile?.displayName ?? record.requester?.email ?? "Recycler",
    material: record.material.name,
    pickupAddress: record.pickupAddress,
    estimatedWeightKg: Number(record.weight?.estimatedKg ?? record.estimatedKg),
    preferredDate: record.requestedFor,
    status,
    collectorId: assignment?.collector.user.id,
    collectorName: assignment?.collector.user.recyclerProfile?.displayName ?? assignment?.collector.user.email,
    collectorAccepted: record.status !== "COLLECTOR_ASSIGNED" && assignment !== undefined,
    collectedWeightKg: record.weight?.actualKg === null || record.weight?.actualKg === undefined ? undefined : Number(record.weight.actualKg),
    verifiedWeightKg: record.weight?.verifiedKg === null || record.weight?.verifiedKg === undefined ? undefined : Number(record.weight.verifiedKg),
  };
}

const roleOptions: { value: UserRole; label: string; description: string }[] = [
  { value: "RECYCLER", label: "Recycler", description: "Find drop-off points and earn rewards" },
  { value: "COLLECTOR", label: "Collector", description: "Accept collection requests and record pickups" },
  { value: "FACILITY", label: "Facility / Business", description: "Manage materials and opening hours" },
];

const SouthAfricaMap = dynamic(() => import("./SouthAfricaMap"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center bg-green-50 text-sm text-gray-500">Loading Johannesburg map…</div>,
});

function BrandIcon() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-xl text-green-700">
      ♻️
    </div>
  );
}

function BottomNav({ active, role, onNavigate }: { active: Screen; role: UserRole; onNavigate: (screen: Screen) => void }) {
  const items: { label: string; screen: Screen; icon: string }[] = role === "COLLECTOR" ? [
    { label: "Home", screen: "dashboard", icon: "🏠" },
    { label: "Requests", screen: "collector-board", icon: "📋" },
    { label: "Pickups", screen: "collector-pickups", icon: "🚚" },
  ] : role === "FACILITY" ? [
    { label: "Home", screen: "dashboard", icon: "🏠" },
    { label: "Facility", screen: "facility-profile", icon: "🏭" },
    { label: "Verify", screen: "facility-verification", icon: "✅" },
  ] : [
    { label: "Home", screen: "dashboard", icon: "🏠" },
    { label: "Find", screen: "find", icon: "🔍" },
    { label: "Map", screen: "map", icon: "🗺️" },
    { label: "Saved", screen: "saved", icon: "🔖" },
  ];

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 border-t border-gray-100 bg-white/95 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] backdrop-blur">
      {items.map((item) => (
        <button
          key={item.screen}
          onClick={() => onNavigate(item.screen)}
          aria-current={active === item.screen ? "page" : undefined}
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${active === item.screen ? "text-green-700" : "text-gray-400 hover:text-gray-700"}`}
        >
          <span aria-hidden="true" className="flex h-6 items-center text-xl font-semibold leading-none">{item.icon}</span>
          <span className="text-[10px] font-semibold">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function openDirections(destination: Location) {
  const destinationQuery = `${destination.latitude},${destination.longitude}`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`;

  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const origin = `${coords.latitude},${coords.longitude}`;
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destinationQuery)}`;
        window.open(directionsUrl, "_blank", "noopener,noreferrer");
      },
      () => {
        window.open(mapsUrl, "_blank", "noopener,noreferrer");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return;
  }

  window.open(mapsUrl, "_blank", "noopener,noreferrer");
}

function SavedScreen({ locations: savedLocations, onSelect }: { locations: Location[]; onSelect: (location: Location) => void }) {
  return (
    <main className="min-h-[calc(100vh-130px)] bg-gray-50 pb-8">
      <div className="border-b border-gray-100 bg-white px-6 pb-5 pt-8">
        <h1 className="font-display text-2xl font-extrabold text-gray-900">Saved locations</h1>
        <p className="mt-1 text-sm text-gray-500">{savedLocations.length} saved {savedLocations.length === 1 ? "location" : "locations"}</p>
      </div>
      {savedLocations.length === 0 ? (
        <div className="px-8 pt-20 text-center">
          <span aria-hidden="true" className="text-5xl text-green-700">▱</span>
          <h2 className="mt-4 font-display text-xl font-bold text-gray-800">No saved locations</h2>
          <p className="mt-2 text-sm text-gray-500">Save a facility from its details to find it here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4">
          {savedLocations.map((location) => (
            <article key={location.name} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h2 className="font-display text-base font-bold text-gray-900">{location.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{location.fullAddress}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-green-700">{location.distance}</span>
                <button onClick={() => onSelect(location)} className="rounded-lg border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">View details</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="5.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s6-6.3 6-11a6 6 0 1 0-12 0c0 4.7 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.8 4.5h2.3l1 4.7-2 1.8A13.4 13.4 0 0 0 17 18l1.8-2 4.7 1v2.3a2.5 2.5 0 0 1-2.5 2.5A16.5 16.5 0 0 1 4.3 7a2.5 2.5 0 0 1 2.5-2.5Z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m5 7 7 6 7-6" />
    </svg>
  );
}

function AuthScreen({
  mode,
  setMode,
  onLogin,
  isSubmitting,
  errorMessage,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onLogin: (input: AuthSubmission) => void;
  isSubmitting: boolean;
  errorMessage: string;
}) {
  const isLogin = mode === "login";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("RECYCLER");
  const [serviceArea, setServiceArea] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState("25");
  const [serviceCenterLatitude, setServiceCenterLatitude] = useState("");
  const [serviceCenterLongitude, setServiceCenterLongitude] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityAddress, setFacilityAddress] = useState("");
  const [acceptedMaterials, setAcceptedMaterials] = useState<string[]>([]);
  const [openingHours, setOpeningHours] = useState(Array.from({ length: 7 }, () => ""));
  const [validationError, setValidationError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError("");
    if (!isLogin && password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    if (!isLogin && role === "FACILITY" && acceptedMaterials.length === 0) {
      setValidationError("Select at least one accepted material.");
      return;
    }
    if (!isLogin && role === "FACILITY" && !openingHours.some((hours) => hours.trim())) {
      setValidationError("Add opening hours for at least one day.");
      return;
    }
    onLogin({
      email,
      password,
      ...(!isLogin ? {
        displayName,
        role,
        ...(role === "COLLECTOR" ? {
          serviceArea,
          serviceRadiusKm: Number(serviceRadiusKm),
          serviceCenterLatitude: Number(serviceCenterLatitude),
          serviceCenterLongitude: Number(serviceCenterLongitude),
          vehicleType,
        } : {}),
        ...(role === "FACILITY" ? {
          facilityName,
          facilityAddress,
          acceptedMaterials,
          openingHours,
        } : {}),
      } : {}),
    });
  };

  const formError = validationError || errorMessage;

  return (
    <div className="min-h-[calc(100vh-58px)] bg-gray-50">
      <div className="flex min-h-[calc(100vh-58px)] flex-col">
        <div className="hidden">
          <div className="flex items-center gap-3 px-2 pt-2">
            <BrandIcon />
            <div className="text-[15px] font-semibold tracking-[-0.03em] text-[#1f6d5a]">WasteWise</div>
          </div>

          <div className="relative z-10 flex h-full flex-col justify-center px-4 pb-4 pt-14 md:px-10">
            <div className="mb-6 inline-flex items-center gap-3 self-start rounded-full border border-[#d4e3d8] bg-[#edf4ee] px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.2em] text-[#1f6d5a]">
              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#1f8f6d] text-[8px] text-white">◌</span>
              Recycle today • a cleaner tomorrow
            </div>

            <h1 className="max-w-[620px] text-[62px] font-semibold leading-[0.95] tracking-[-0.07em] text-[#1d3a35]">
              Join WasteWise.
              <span className="block text-[#1f8f6d]">Make a real impact.</span>
            </h1>

            <p className="mt-8 max-w-[540px] text-[18px] leading-[1.5] text-[#425d59]">
              Create your account to find nearby recycling and waste drop-off points,
              track your impact and help build a cleaner, greener community.
            </p>

            <div className="mt-10 flex flex-wrap gap-5">
              {[
                "Find nearby drop-off points",
                "Recycle the right materials",
                "A cleaner, greener future",
              ].map((label, idx) => (
                <div key={label} className="flex items-center gap-3 rounded-full bg-[#f4f8f4]/80 px-3 py-2 text-[15px] text-[#1d3a35] shadow-sm ring-1 ring-[#d5e1d8]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dff5ea] text-[#1f8f6d]">
                    {idx === 0 ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s6-6.3 6-11a6 6 0 1 0-12 0c0 4.7 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5" /></svg>
                    ) : idx === 1 ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 9.5A3.5 3.5 0 0 1 11.5 6h1A3.5 3.5 0 0 1 16 9.5V10h-8v-.5Z"/><path d="M7 10h10l-1.4 8.2A2.2 2.2 0 0 1 13.4 20h-2.8a2.2 2.2 0 0 1-2.2-1.8L7 10Z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3c2.8 3.2 4.5 5.9 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 8.9 9.2 6.2 12 3Z"/><path d="M7 19c1.1-1.4 2.7-2.1 5-2.1 2.3 0 3.9.7 5 2.1"/></svg>
                    )}
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute -bottom-16 left-0 h-52 w-52 rounded-full bg-[#cfe7d4]/70" />
          <div className="pointer-events-none absolute -bottom-20 right-20 h-56 w-56 rounded-full border-[18px] border-[#dfeee6]" />
          <div className="pointer-events-none absolute -bottom-12 left-40 h-40 w-40 rounded-full border-[18px] border-[#dfeee6]" />
        </div>

        <div className="flex items-start justify-center bg-gray-50 px-5 py-10 sm:px-8">
          <div className="w-full max-w-[480px]">
            <div className="mb-5 hidden justify-center">
              <BrandIcon />
            </div>

            <h2 className="text-center font-display text-[30px] font-extrabold text-gray-900">
              {isLogin ? "Your WasteWise account" : "Create your WasteWise account"}
            </h2>
            <p className="mt-2 text-center text-[14px] text-gray-500">
              {isLogin ? "Log in or create an account to continue." : "Join WasteWise to save locations and make every drop-off count."}
            </p>

            <div className="mt-7 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
              {isLogin ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="mb-4 text-center text-[28px] font-semibold tracking-[-0.05em] text-[#203f39]">Welcome back</h3>
                  <p className="mb-5 text-center text-[14px] text-[#586d69]">Log in to save locations and manage your recycling journey.</p>

                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                      placeholder="you@example.com"
                    />
                  </label>

                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Password
                    <div className="relative mt-2">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 pr-16 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1d6d59] hover:text-[#164f43]">{showPassword ? "Hide" : "Show"}</button>
                    </div>
                  </label>

                  {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}

                  <button type="submit" disabled={isSubmitting} className="mt-2 w-full rounded-[10px] bg-[#1f8f6d] px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-[#187d62] disabled:cursor-wait disabled:opacity-70">{isSubmitting ? "Signing in…" : "Log In"}</button>

                  <div className="pt-1 text-center text-[13px] text-[#5f736d]">
                    Don&apos;t have an account? <button type="button" onClick={() => setMode("signup")} className="font-medium text-[#1d6d59] hover:text-[#164f43]">Sign Up</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Full name
                    <div className="relative mt-2">
                      <input
                        required
                        minLength={2}
                        autoComplete="name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className="w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 pl-10 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                        placeholder="Your full name"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7d79]">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 12a3.6 3.6 0 1 0 0-7.2A3.6 3.6 0 0 0 12 12Z"/><path d="M5 19.5c1.2-2.7 4-4.1 7-4.1 3 0 5.8 1.4 7 4.1"/></svg>
                      </span>
                    </div>
                  </label>

                  <div className="space-y-2">
                    <p className="text-[14px] font-medium text-[#1d3a35]">Account type</p>
                    <div className="grid gap-2">
                      {roleOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRole(option.value)}
                          className={`rounded-xl border px-3 py-2 text-left transition ${role === option.value ? "border-green-300 bg-green-50" : "border-[#d4ddd7] bg-white"}`}
                        >
                          <span className="block text-sm font-semibold text-[#1d3a35]">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-[#5f736d]">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {role === "COLLECTOR" && <fieldset className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <legend className="px-1 text-sm font-semibold text-[#1d3a35]">Collector application</legend>
                    <label className="block text-sm font-medium text-[#1d3a35]">Service area
                      <input required minLength={2} value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5" placeholder="Johannesburg North" />
                    </label>
                    <label className="block text-sm font-medium text-[#1d3a35]">Service radius (km)
                      <input required type="number" min="1" max="250" step="1" value={serviceRadiusKm} onChange={(event) => setServiceRadiusKm(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5" />
                    </label>
                    <label className="block text-sm font-medium text-[#1d3a35]">Vehicle type
                      <input required minLength={2} value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5" placeholder="Van, truck, bicycle" />
                    </label>
                    <p className="text-xs font-medium text-[#38554d]">Service center coordinates (used to match nearby requests)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-[#1d3a35]">Latitude
                        <input required type="number" min="-90" max="90" step="any" value={serviceCenterLatitude} onChange={(event) => setServiceCenterLatitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5 text-sm" />
                      </label>
                      <label className="text-xs font-medium text-[#1d3a35]">Longitude
                        <input required type="number" min="-180" max="180" step="any" value={serviceCenterLongitude} onChange={(event) => setServiceCenterLongitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5 text-sm" />
                      </label>
                    </div>
                    <p className="text-xs text-[#5f736d]">Collector applications require Admin approval before assignments are available.</p>
                  </fieldset>}

                  {role === "FACILITY" && <fieldset className="space-y-3 rounded-xl border border-green-100 bg-green-50/60 p-4">
                    <legend className="px-1 text-sm font-semibold text-[#1d3a35]">Facility application</legend>
                    <label className="block text-sm font-medium text-[#1d3a35]">Facility name
                      <input required minLength={2} value={facilityName} onChange={(event) => setFacilityName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5" />
                    </label>
                    <label className="block text-sm font-medium text-[#1d3a35]">Facility address
                      <input required minLength={5} value={facilityAddress} onChange={(event) => setFacilityAddress(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d4ddd7] bg-white px-3 py-2.5" />
                    </label>
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-[#1d3a35]">Accepted materials</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {materials.slice(1).map((material) => <label key={material} className="flex items-center gap-2 text-xs text-[#38554d]">
                          <input type="checkbox" checked={acceptedMaterials.includes(material)} onChange={(event) => setAcceptedMaterials((current) => event.target.checked ? [...current, material] : current.filter((item) => item !== material))} className="h-4 w-4 accent-green-700" />
                          {material}
                        </label>)}
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="mb-2 text-sm font-medium text-[#1d3a35]">Opening hours by day</legend>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <label key={day} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-xs text-[#38554d]">
                        <span>{day}</span>
                        <input value={openingHours[index]} onChange={(event) => setOpeningHours((current) => current.map((hours, hourIndex) => hourIndex === index ? event.target.value : hours))} className="min-w-0 rounded-lg border border-[#d4ddd7] bg-white px-2 py-2 text-sm" placeholder="08:00-17:00 or Closed" />
                      </label>)}
                    </fieldset>
                    <p className="text-xs text-[#5f736d]">Facility applications require Admin approval before appearing as approved locations.</p>
                  </fieldset>}

                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Email
                    <div className="relative mt-2">
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 pl-10 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                        placeholder="you@example.com"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7d79]">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m5 7 7 6 7-6" /></svg>
                      </span>
                    </div>
                  </label>

                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Password
                    <div className="relative mt-2">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={12}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 pr-16 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                        placeholder="Create a password"
                      />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1d6d59] hover:text-[#164f43]">{showPassword ? "Hide" : "Show"}</button>
                    </div>
                  </label>

                  <label className="block text-[14px] font-medium text-[#1d3a35]">
                    Confirm password
                    <div className="relative mt-2">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        minLength={12}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 pr-16 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
                        placeholder="Confirm your password"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1d6d59] hover:text-[#164f43]">{showConfirmPassword ? "Hide" : "Show"}</button>
                    </div>
                  </label>

                  {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}

                  <button type="submit" disabled={isSubmitting} className="mt-2 w-full rounded-[10px] bg-[#1f8f6d] px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-[#187d62] disabled:cursor-wait disabled:opacity-70">
                    {isSubmitting ? "Creating account…" : <>Sign Up <span className="ml-2">→</span></>}
                  </button>

                  <div className="pt-1 text-center text-[13px] text-[#5f736d]">
                    Already have an account? <button type="button" onClick={() => setMode("login")} className="font-medium text-[#1d6d59] hover:text-[#164f43]">Log In</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardScreen({
  displayName,
  role,
  onSearch,
  onOpenFind,
  onOpenMap,
  onSelectLocation,
  onSelectMaterial,
  onOpenDirections,
  onRoleAction,
}: {
  displayName: string;
  role: UserRole;
  onSearch: (query: string) => void;
  onOpenFind: () => void;
  onOpenMap: (location: Location) => void;
  onSelectLocation: (location: Location) => void;
  onSelectMaterial: (material: string) => void;
  onOpenDirections: (location: Location) => void;
  onRoleAction: (action: string) => void;
}) {
  const [search, setSearch] = useState("");
  const greetingName = displayName || "there";
  const roleHeading = role === "COLLECTOR" ? "Ready for your next collection run?" : role === "FACILITY" ? "Manage Your Facility" : "What are you recycling today?";
  const roleActions = role === "COLLECTOR" ? [
    "See collection requests",
    "Accept assignments",
    "View collection locations",
    "Record collected material",
  ] : role === "FACILITY" ? [
    "Register facility",
    "List accepted materials",
    "Update opening hours",
    "Verify collected quantities",
  ] : [
    "Find drop-off points",
    "Request collection",
    "Track collections",
    "Earn points and redeem rewards",
  ];

  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-24">
      <div className="flex items-end justify-between gap-4 bg-green-600 px-6 pb-7 pt-8 text-white">
        <div>
          <p className="mb-1 text-sm font-medium text-green-100">Hello, {greetingName}</p>
          <h1 className="max-w-[400px] font-display text-2xl font-extrabold leading-tight text-white">{roleHeading}</h1>
        </div>
        <button onClick={() => onOpenMap(locations[0])} aria-label="Open the map" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500 text-xl text-white transition-colors hover:bg-green-400">
          <MapPinIcon />
        </button>
      </div>

      {role === "RECYCLER" && <div className="relative mx-4 -mt-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center text-[#1b7a61]">
          <SearchIcon />
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch(search);
          }}
          aria-label="Search recycling points, locations, or materials"
          placeholder="Search recycling points, locations or materials"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        <button onClick={() => onSearch(search)} className="shrink-0 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700">
          Search
        </button>
      </div>}

      <section className="mt-6 px-6">
        <h2 className="mb-3 font-display text-base font-bold text-gray-900">{role === "COLLECTOR" ? "Collection priorities" : role === "FACILITY" ? "Facility operations" : "Waste categories"}</h2>
        <div className="grid grid-cols-2 gap-2.5">
        {roleActions.map((item, index) => {
          const categoryIcons = ["♻️", "🧴", "🚚", "📦", "📍", "✅", "🕒", "🏆"];
          const categoryColors = ["bg-green-50 border-green-200", "bg-blue-50 border-blue-200", "bg-rose-50 border-rose-200", "bg-amber-50 border-amber-200", "bg-slate-50 border-slate-200", "bg-violet-50 border-violet-200", "bg-orange-50 border-orange-200", "bg-emerald-50 border-emerald-200"];

          return (
          <button
            key={item}
            onClick={() => role === "RECYCLER" ? (item.includes("points") ? onSelectMaterial("Plastic") : onRoleAction(item)) : onRoleAction(item)}
            className={`rounded-xl border p-3 text-center transition-shadow hover:shadow-sm ${categoryColors[index]}`}
          >
            <span aria-hidden="true" className="mb-1 block text-2xl">{categoryIcons[index]}</span>
            <span className="block text-xs font-semibold leading-tight text-gray-700">{item}</span>
          </button>
          );
        })}
        </div>
      </section>

      {role === "RECYCLER" && (
        <section className="mt-6 px-6">
          <h2 className="mb-3 font-display text-base font-bold text-gray-900">Waste categories</h2>
          <div className="grid grid-cols-3 gap-2.5">
          {materials.map((item, index) => {
            const categoryIcons = ["♻️", "🧴", "🍾", "📄", "🔩", "💻", "🗑️"];
            const categoryColors = ["bg-green-50 border-green-200", "bg-blue-50 border-blue-200", "bg-rose-50 border-rose-200", "bg-amber-50 border-amber-200", "bg-slate-50 border-slate-200", "bg-violet-50 border-violet-200", "bg-orange-50 border-orange-200"];

            return (
            <button
              key={item}
              onClick={() => onSelectMaterial(item)}
              className={`rounded-xl border p-3 text-center transition-shadow hover:shadow-sm ${categoryColors[index]}`}
            >
              <span aria-hidden="true" className="mb-1 block text-2xl">{categoryIcons[index]}</span>
              <span className="block text-xs font-semibold leading-tight text-gray-700">{item}</span>
            </button>
            );
          })}
          </div>
        </section>
      )}

      {role === "RECYCLER" && <section className="mt-6 px-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-gray-900">Nearby drop-off points</h2>
          <button onClick={onOpenFind} className="text-sm font-semibold text-green-700">View all</button>
        </div>

      <div className="flex flex-col gap-3">
        {locations.map((item) => (
          <article key={item.name} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-3 flex items-start justify-between gap-2">
              <button onClick={() => onSelectLocation(item)} className="text-left font-display text-base font-bold leading-snug text-gray-900 hover:underline">{item.name}</button>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  item.status === "Open" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}
              >
                {item.status}
              </span>
            </div>

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2 text-gray-500">
                <MapPinIcon />
                <span>{item.shortAddress}</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {item.accepted.slice(0, 3).map((material) => <span key={material} className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{material}</span>)}
                {item.accepted.length > 3 && <span className="text-xs text-gray-400">+{item.accepted.length - 3}</span>}
              </div>
              <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                <span className="text-xs text-gray-500">{item.status === "Open" ? `Closes ${item.openUntil}` : "Closed now"}</span>
                <button onClick={() => onOpenDirections(item)} className="text-sm font-semibold text-green-700 hover:text-green-800">
                  Directions →
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      </section>}
    </main>
  );
}

function FindScreen({
  onBack,
  onSelect,
  onMap,
  initialQuery,
  initialMaterial,
}: {
  onBack: () => void;
  onSelect: (location: Location) => void;
  onMap: () => void;
  initialQuery: string;
  initialMaterial: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [materialFilter, setMaterialFilter] = useState(initialMaterial);
  const [distanceLimit, setDistanceLimit] = useState(5);
  const [hoursFilter, setHoursFilter] = useState("Any time");
  const filteredLocations = locations.filter((location) => {
    const searchText = `${location.name} ${location.shortAddress} ${location.accepted.join(" ")}`.toLowerCase();
    const matchesQuery = searchText.includes(query.trim().toLowerCase());
    const matchesMaterial = materialFilter === "All materials" || location.accepted.includes(materialFilter);
    const matchesDistance = Number.parseFloat(location.distance) <= distanceLimit;
    const matchesHours =
      hoursFilter === "Any time" ||
      (hoursFilter === "Open now" && location.status === "Open") ||
      (hoursFilter === "Open weekends" && location.hours[5] !== "Saturday Closed");

    return matchesQuery && matchesMaterial && matchesDistance && matchesHours;
  });

  const resetFilters = () => {
    setQuery("");
    setMaterialFilter("All materials");
    setDistanceLimit(5);
    setHoursFilter("Any time");
  };

  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-24">
      <div className="sticky top-[58px] z-30 border-b border-gray-100 bg-white px-4 pb-4 pt-5">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <button onClick={onBack} aria-label="Back to dashboard" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-gray-600">←</button>
            <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-gray-900">{query || "Find drop-off points"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center text-green-600">
          <MapPinIcon />
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search by location, facility, or material"
          placeholder="Location, postcode or waste type"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
          <button onClick={onMap} className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700">
          Map
        </button>
      </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-gray-900">Filters</h3>
            <button onClick={resetFilters} className="text-xs font-semibold text-green-700">Reset</button>
          </div>

          <div className="space-y-5">
            <div>
              <h4 className="mb-3 text-[14px] font-semibold text-[#1a3d35]">Material type</h4>
              <div className="space-y-2 text-[14px] text-[#38554d]">
                {["All materials", "Plastic", "Glass", "Paper", "Metal", "E-Waste"].map((label) => (
                  <label key={label} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="material"
                      value={label}
                      checked={materialFilter === label}
                      onChange={() => setMaterialFilter(label)}
                      className="h-4 w-4 accent-[#1f8f6d]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-[14px] font-semibold text-[#1a3d35]">Distance range</h4>
              <div className="space-y-2 text-[14px] text-[#38554d]">
                {[
                  "Within 5 km",
                  "Within 10 km",
                  "Within 25 km",
                ].map((label) => (
                  <label key={label} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="distance"
                      checked={Number.parseInt(label, 10) === distanceLimit}
                      onChange={() => setDistanceLimit(Number.parseInt(label, 10))}
                      className="h-4 w-4 accent-[#1f8f6d]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-[14px] font-semibold text-[#1a3d35]">Opening hours</h4>
              <div className="space-y-2 text-[14px] text-[#38554d]">
                {[
                  "Open now",
                  "Open weekends",
                  "Any time",
                ].map((label) => (
                  <label key={label} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="hours"
                      checked={hoursFilter === label}
                      onChange={() => setHoursFilter(label)}
                      className="h-4 w-4 accent-[#1f8f6d]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-gray-900">{filteredLocations.length} results found</h2>
            <span className="text-xs text-gray-500">Nearest first</span>
          </div>

          {filteredLocations.map((item) => (
            <button key={item.name} onClick={() => onSelect(item)} className="block w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold leading-snug text-gray-900">{item.name}</h3>
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <MapPinIcon />
                    <span>{item.shortAddress}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{item.accepted.slice(0, 3).map((material) => <span key={material} className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{material}</span>)}</div>
                  <p className="mt-2 text-xs text-gray-500">{item.status === "Open" ? `Closes ${item.openUntil}` : "Closed now"}</p>
                </div>

                <div className="pt-1">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.status === "Open" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end text-[#1f6d5a] font-medium">
                View details →
              </div>
            </button>
          ))}
          {filteredLocations.length === 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
              <p className="font-medium text-gray-800">No locations match these filters.</p>
              <button onClick={resetFilters} className="mt-3 text-sm font-medium text-green-700 hover:underline">
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MapScreen({
  location,
  onBack,
  onOpenDetails,
  onReport,
  onSelectLocation,
}: {
  location: Location;
  onBack: () => void;
  onOpenDetails: () => void;
  onReport: () => void;
  onSelectLocation: (location: Location) => void;
}) {
  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 px-4 pb-24 pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-[#3a544d]">
          <MapPinIcon />
          <span>Johannesburg, South Africa · {locations.length} locations</span>
        </div>
        <button onClick={onBack} className="text-sm font-medium text-[#1f6d5a] hover:underline">Back to results</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
        <SouthAfricaMap locations={locations} selectedLocation={location} onSelectLocation={onSelectLocation} />
      </div>

      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-gray-900">{location.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{location.shortAddress}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-green-700">{location.distance}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {location.accepted.slice(0, 4).map((material) => <span key={material} className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{material}</span>)}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onOpenDetails} className="flex-1 rounded-xl border border-green-200 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50">View details</button>
          <button onClick={onReport} className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700">Report a problem</button>
        </div>
      </section>

      <section className="mt-5" aria-labelledby="map-locations-heading">
        <h2 id="map-locations-heading" className="mb-3 font-display text-base font-bold text-gray-900">Nearby facilities</h2>
        <div className="flex flex-col gap-2">
          {locations.map((item) => (
            <button key={item.name} onClick={() => onSelectLocation(item)} aria-pressed={location.name === item.name} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${location.name === item.name ? "border-green-300 bg-green-50" : "border-gray-100 bg-white"}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-800">{item.name}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{item.shortAddress}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-green-700">{item.distance}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function DetailsScreen({
  location,
  onBack,
  onDirections,
  isSaved,
  onToggleSave,
}: {
  location: Location;
  onBack: () => void;
  onDirections: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-28">
      <div
        role="img"
        aria-label={`${location.name} facility photo`}
        className="relative h-56 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(to top, rgba(17,24,39,.45), transparent 65%), url('${location.image}')` }}
      >
        <button onClick={onBack} aria-label="Back to results" className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-lg text-gray-700 shadow-md">←</button>
        <button onClick={onToggleSave} aria-label={isSaved ? "Remove saved location" : "Save location"} aria-pressed={isSaved} className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-md ${isSaved ? "bg-green-600 text-white" : "bg-white/95 text-gray-600"}`}>
          {isSaved ? "▣" : "▱"}
        </button>
      </div>

      <section className="border-b border-gray-100 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold leading-snug text-gray-900">{location.name}</h1>
            <p className="mt-1 flex items-start gap-2 text-sm text-gray-500"><MapPinIcon /><span>{location.fullAddress}</span></p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-green-700">{location.distance}</span>
        </div>
        <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${location.status === "Open" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {location.status === "Open" ? `Open until ${location.openUntil}` : "Closed"}
        </span>
      </section>

      <section className="mt-3 border-y border-gray-100 bg-white px-6 py-5">
        <h2 className="mb-4 font-display text-base font-bold text-gray-800">Contact information</h2>
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <a href={`tel:${location.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-700"><PhoneIcon /></span>{location.phone}</a>
          <a href={`mailto:${location.email}`} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-700"><EnvelopeIcon /></span>{location.email}</a>
        </div>
      </section>

      <section className="mt-3 border-y border-gray-100 bg-white px-6 py-5">
        <h2 className="mb-4 font-display text-base font-bold text-gray-800">Opening hours</h2>
        <div className="flex flex-col gap-2.5 text-sm">
          {location.hours.map((line) => (
            <div key={line} className="flex items-center justify-between gap-3">
              <span className="text-gray-600">{line.includes("Closed") ? "Sunday" : line.split(" ")[0]}</span>
              <span className={`font-semibold ${line.includes("Closed") ? "text-red-500" : "text-gray-800"}`}>{line.replace(/^[A-Za-z]+\s/, "")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 border-y border-gray-100 bg-white px-6 py-5">
        <h2 className="mb-4 font-display text-base font-bold text-gray-800">Accepted materials</h2>
        <div className="flex flex-wrap gap-2">
          {location.accepted.map((material, index) => {
            const colors = ["bg-blue-100 text-blue-700", "bg-amber-100 text-amber-700", "bg-green-100 text-green-700", "bg-slate-100 text-slate-700", "bg-rose-100 text-rose-700"];
            return <span key={material} className={`rounded-full px-2.5 py-1 text-xs font-medium ${colors[index % colors.length]}`}>{material}</span>;
          })}
        </div>
      </section>

      <section className="mx-4 mt-4 h-44 overflow-hidden rounded-2xl border border-gray-100 bg-[#dff0e4]" aria-label="Map preview">
        <div className="relative h-full">
          <div className="absolute left-4 top-10 h-28 w-28 rounded-full border-[10px] border-white/90" />
          <div className="absolute left-24 top-4 h-28 w-40 rounded-[40%] border-[10px] border-white/90" />
          <div className="absolute right-16 top-12 h-24 w-28 rounded-full border-[10px] border-white/90" />
          <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-green-600 text-white shadow-lg"><BrandIcon /></span>
        </div>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-2xl -translate-x-1/2 gap-3 border-t border-gray-100 bg-white px-5 py-3">
        <button onClick={onDirections} className="flex-1 rounded-xl bg-green-600 py-3.5 font-display text-sm font-bold text-white transition-colors hover:bg-green-700">Get directions</button>
        <a href={`tel:${location.phone.replace(/[^+\d]/g, "")}`} className="flex-1 rounded-xl border border-gray-200 py-3.5 text-center font-display text-sm font-bold text-gray-700">Call</a>
      </div>
    </main>
  );
}

function ReportScreen({
  onBack,
  location,
}: {
  onBack: () => void;
  location: Location;
}) {
  const [reportType, setReportType] = useState<"correction" | "suggestion" | "collector-problem" | "collection-problem">("correction");
  const [facilityName, setFacilityName] = useState(location.name);
  const [address, setAddress] = useState(location.fullAddress.split(" · ")[0]);
  const [description, setDescription] = useState("");
  const [acceptedMaterials, setAcceptedMaterials] = useState(location.accepted);
  const [suggestedLatitude, setSuggestedLatitude] = useState("");
  const [suggestedLongitude, setSuggestedLongitude] = useState("");
  const [collectionReference, setCollectionReference] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const chooseReportType = (type: "correction" | "suggestion" | "collector-problem" | "collection-problem") => {
    setReportType(type);
    setFacilityName(type === "correction" ? location.name : "");
    setAddress(type === "correction" ? location.fullAddress.split(" · ")[0] : "");
    setAcceptedMaterials(type === "correction" ? location.accepted : []);
    setError("");
  };

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[600px] flex-col items-center justify-center bg-white px-6 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dff5ea] text-3xl font-semibold text-[#1b7a61]">✓</div>
        <h1 className="mt-5 text-[30px] font-semibold text-[#1a3d35]">Report submitted</h1>
        <p className="mt-2 text-[15px] text-[#5d736d]">Your report has been sent to the WasteWise Admin team for review.</p>
        <button onClick={onBack} className="mt-6 rounded-[10px] bg-[#1f8f6d] px-5 py-3 text-sm font-semibold text-white hover:bg-[#177d62]">Back to the map</button>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-58px)] bg-gray-50 pb-8">
      <header className="border-b border-gray-100 bg-white px-6 pb-5 pt-7">
        <button onClick={onBack} className="mb-3 text-sm font-medium text-green-700 hover:underline">← Back to map</button>
        <h1 className="font-display text-xl font-bold text-gray-900">Report an issue</h1>
        <p className="mt-1 text-sm text-gray-500">Help keep WasteWise accurate and useful for everyone.</p>
      </header>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (reportType === "suggestion" && acceptedMaterials.length === 0) {
            setError("Choose at least one accepted material for the suggested location.");
            return;
          }
          const latitudeValue = Number(suggestedLatitude);
          const longitudeValue = Number(suggestedLongitude);
          if (reportType === "suggestion" && (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90 || !Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180)) {
            setError("Enter valid coordinates for the suggested location.");
            return;
          }
          setError("");
          setIsSubmitting(true);
          try {
            const type = reportType === "suggestion"
              ? "SUGGEST_NEW_FACILITY"
              : reportType === "collector-problem"
                ? "COLLECTOR_PROBLEM"
                : reportType === "collection-problem"
                  ? "COLLECTION_PROBLEM"
                  : "INCORRECT_INFORMATION";
            const reportDescription = reportType === "collector-problem" || reportType === "collection-problem"
              ? `${collectionReference.trim() ? `Collection ${collectionReference.trim()}: ` : ""}${description.trim()}`
              : description.trim();
            await createUserReport({
              type,
              description: reportDescription,
              ...(reportType === "suggestion" ? {
                suggestedName: facilityName.trim(),
                suggestedAddress: address.trim(),
                suggestedLatitude: latitudeValue,
                suggestedLongitude: longitudeValue,
                suggestedAcceptedMaterials: acceptedMaterials,
              } : reportType === "correction" ? {
                suggestedName: facilityName.trim(),
                suggestedAddress: address.trim(),
                suggestedLatitude: location.latitude,
                suggestedLongitude: location.longitude,
              } : {}),
            });
            setSubmitted(true);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not submit this report.");
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 py-6"
      >
        <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-2 sm:flex-row">
          <button type="button" aria-pressed={reportType === "correction"} onClick={() => chooseReportType("correction")} className={`flex-1 rounded-[8px] px-3 py-2 text-[14px] font-medium ${reportType === "correction" ? "bg-white text-[#1d6d59] shadow-sm" : "text-[#48645b]"}`}>Facility information</button>
          <button type="button" aria-pressed={reportType === "suggestion"} onClick={() => chooseReportType("suggestion")} className={`flex-1 rounded-[8px] px-3 py-2 text-[14px] font-medium ${reportType === "suggestion" ? "bg-white text-[#1d6d59] shadow-sm" : "text-[#48645b]"}`}>Suggest facility</button>
          <button type="button" aria-pressed={reportType === "collector-problem"} onClick={() => chooseReportType("collector-problem")} className={`flex-1 rounded-[8px] px-3 py-2 text-[14px] font-medium ${reportType === "collector-problem" ? "bg-white text-[#1d6d59] shadow-sm" : "text-[#48645b]"}`}>Collector problem</button>
          <button type="button" aria-pressed={reportType === "collection-problem"} onClick={() => chooseReportType("collection-problem")} className={`flex-1 rounded-[8px] px-3 py-2 text-[14px] font-medium ${reportType === "collection-problem" ? "bg-white text-[#1d6d59] shadow-sm" : "text-[#48645b]"}`}>Collection problem</button>
        </div>

        <div className="space-y-5">
          <label className="block text-[14px] font-medium text-[#1d3a35]">
            {reportType === "collector-problem" || reportType === "collection-problem" ? "Facility name (optional)" : "Location name"}
            <input
              required={reportType === "correction" || reportType === "suggestion"}
              value={facilityName}
              onChange={(event) => setFacilityName(event.target.value)}
              className="mt-2 w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
              placeholder="e.g. Green Recycling Centre"
            />
          </label>

          <label className="block text-[14px] font-medium text-[#1d3a35]">
            Address
            <input
              required={reportType === "suggestion"}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-2 w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
              placeholder="Street address, town or postcode"
            />
          </label>

          {(reportType === "collector-problem" || reportType === "collection-problem") && <label className="block text-[14px] font-medium text-[#1d3a35]">Collection reference (optional)
            <input value={collectionReference} onChange={(event) => setCollectionReference(event.target.value)} className="mt-2 w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 text-[14px]" placeholder="Request ID, if known" />
          </label>}

          <label className="block text-[14px] font-medium text-[#1d3a35]">
            Issue description / Details
            <textarea
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="mt-2 w-full rounded-[10px] border border-[#d4ddd7] bg-white px-3 py-3 text-[14px] text-[#1d3a35] placeholder:text-[#7a887f] outline-none focus:border-[#1f8f6d]"
              placeholder="Tell us what needs correcting or share details about the new location..."
            />
          </label>

          {reportType === "suggestion" && (
            <fieldset>
              <legend className="mb-3 text-[14px] font-medium text-[#1d3a35]">Accepted materials</legend>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {materials.slice(1).map((material) => (
                  <label key={material} className="flex items-center gap-2 text-[#38554d]">
                    <input
                      type="checkbox"
                      checked={acceptedMaterials.includes(material)}
                      onChange={(event) => setAcceptedMaterials((current) => event.target.checked ? [...current, material] : current.filter((item) => item !== material))}
                      className="h-4 w-4 accent-[#1f8f6d]"
                    />
                    {material}
                  </label>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-[#1d3a35]">Latitude<input required type="number" min="-90" max="90" step="any" value={suggestedLatitude} onChange={(event) => setSuggestedLatitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d4ddd7] px-3 py-2.5" /></label>
                <label className="text-sm font-medium text-[#1d3a35]">Longitude<input required type="number" min="-180" max="180" step="any" value={suggestedLongitude} onChange={(event) => setSuggestedLongitude(event.target.value)} className="mt-1 block w-full rounded-lg border border-[#d4ddd7] px-3 py-2.5" /></label>
              </div>
            </fieldset>
          )}

          {error && <p role="alert" className="text-sm text-[#b64b45]">{error}</p>}

          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting} className="rounded-[12px] bg-[#1f8f6d] px-5 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-[#177d62] disabled:opacity-50">
              {isSubmitting ? "Submitting…" : reportType === "suggestion" ? "Submit suggestion" : "Submit report"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; displayName: string; email: string; role: UserRole } | null>(null);
  const [screen, setScreen] = useState<Screen>(isAuthenticated ? "dashboard" : "auth");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location>(locations[0]);
  const [savedLocationNames, setSavedLocationNames] = useState<string[]>([]);
  const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);
  const [facilityProfiles, setFacilityProfiles] = useState<Record<string, FacilityProfile>>({});
  const [pointsBalance, setPointsBalance] = useState(0);
  const [rewardRates, setRewardRates] = useState<Array<{ material: string; pointsPerKg: number }>>([]);
  const [findInitialQuery, setFindInitialQuery] = useState("");
  const [findInitialMaterial, setFindInitialMaterial] = useState("All materials");
  const savedLocations = locations.filter((location) => savedLocationNames.includes(location.name));
  const facilityProfile = currentUser ? facilityProfiles[currentUser.id] ?? null : null;

  const refreshRoleWorkflow = async (userId: string, role: UserRole) => {
    if (role === "ADMIN") return;
    const records = await getCollectionRequests();
    setCollectionRequests(records.map(toWorkflowCollection));
    if (role === "RECYCLER") {
      const rewards = await getRecyclerRewards();
      setPointsBalance(rewards.pointsBalance);
      setRewardRates(rewards.rates);
    } else {
      setPointsBalance(0);
      setRewardRates([]);
    }
    if (role === "FACILITY") {
      const profile = await getFacilityProfile();
      setFacilityProfiles((current) => ({
        ...current,
        [userId]: {
          name: profile.name,
          address: profile.address,
          acceptedMaterials: profile.acceptedMaterials,
          openingHours: profile.openingHours.map((hour) => hour.isClosed ? "Closed" : `${hour.opensAt ?? ""}-${hour.closesAt ?? ""}`),
        },
      }));
    }
  };

  useEffect(() => {
    let active = true;
    getSession()
      .then(async (session) => {
        if (active) {
          setCurrentUser({
            id: session.user.id,
            displayName: session.user.displayName ?? "there",
            email: session.user.email,
            role: session.user.role,
          });
          setIsAuthenticated(true);
          if (session.user.role === "ADMIN") {
            router.replace("/admin");
            return;
          }
          setScreen("dashboard");
          try {
            await refreshRoleWorkflow(session.user.id, session.user.role);
          } catch (error) {
            if (active) setAuthError(error instanceof Error ? error.message : "Could not load your collection activity.");
          }
        }
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof AuthApiError && error.statusCode === 401)) {
          setAuthError(error instanceof Error ? error.message : "Could not restore your session.");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const goToDashboard = () => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    if (currentUser?.role === "ADMIN") {
      router.push("/admin");
      return;
    }
    setScreen("dashboard");
  };
  const goToFind = () => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    setFindInitialQuery("");
    setFindInitialMaterial("All materials");
    setScreen("find");
  };
  const openFind = (query: string, material = "All materials") => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    setFindInitialQuery(query);
    setFindInitialMaterial(material);
    setScreen("find");
  };
  const goToMap = (location?: Location) => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    if (location) setSelectedLocation(location);
    setScreen("map");
  };
  const goToAuth = () => setScreen("auth");
  const goToDetails = (location: Location) => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    setSelectedLocation(location);
    setScreen("details");
  };
  const goToReport = () => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    setScreen("report");
  };
  const goToSaved = () => {
    if (!isAuthenticated) {
      setScreen("auth");
      return;
    }
    setScreen("saved");
  };
  const toggleSavedLocation = (location: Location) => {
    setSavedLocationNames((current) => current.includes(location.name)
      ? current.filter((name) => name !== location.name)
      : [...current, location.name]);
  };

  const handleRoleAction = (action: string) => {
    if (!currentUser) return;
    if (currentUser.role === "RECYCLER") {
      if (action === "Find drop-off points") goToFind();
      else if (action === "Request collection") setScreen("collection-request");
      else if (action === "Track collections") setScreen("tracking");
      else if (action === "Earn points and redeem rewards") setScreen("rewards");
      return;
    }
    if (currentUser.role === "COLLECTOR") {
      if (action === "See collection requests" || action === "Accept assignments") setScreen("collector-board");
      else if (action === "View collection locations" || action === "Record collected material") setScreen("collector-pickups");
      return;
    }
    if (currentUser.role === "FACILITY") {
      if (action === "Register facility" || action === "List accepted materials" || action === "Update opening hours") setScreen("facility-profile");
      else if (action === "Verify collected quantities") setScreen("facility-verification");
    }
  };

  const createCollectionRequest = async (input: { material: string; destinationFacilityId: string; estimatedKg: number; requestedFor: string; pickupAddress: string; pickupLatitude: number; pickupLongitude: number }) => {
    if (!currentUser || currentUser.role !== "RECYCLER") throw new Error("Sign in with a Recycler account to request collection.");
    await createCollectionRequestApi(input);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const acceptCollectionRequest = async (requestId: string) => {
    if (!currentUser || currentUser.role !== "COLLECTOR") throw new Error("Sign in with an approved Collector account to accept assignments.");
    await acceptCollectionApi(requestId);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const recordCollectedMaterial = async (requestId: string, collectedWeightKg: number) => {
    if (!currentUser || currentUser.role !== "COLLECTOR" || !Number.isFinite(collectedWeightKg) || collectedWeightKg <= 0) throw new Error("Enter a valid collected quantity.");
    await recordCollectedWeight(requestId, collectedWeightKg);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const updateCollectorCurrentLocation = async (latitude: number, longitude: number) => {
    if (!currentUser || currentUser.role !== "COLLECTOR") throw new Error("Sign in with a Collector account to update location.");
    await updateCollectorLocation(latitude, longitude);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const saveFacilityProfile = async (profile: FacilityProfile) => {
    if (!currentUser || currentUser.role !== "FACILITY") throw new Error("Sign in with a Facility account to update a profile.");
    const savedProfile = await saveFacilityProfileApi(profile);
    setFacilityProfiles((current) => ({ ...current, [currentUser.id]: {
      name: savedProfile.name,
      address: savedProfile.address,
      acceptedMaterials: savedProfile.acceptedMaterials,
      openingHours: savedProfile.openingHours.map((hour) => hour.isClosed ? "Closed" : `${hour.opensAt ?? ""}-${hour.closesAt ?? ""}`),
    } }));
  };

  const verifyReceivedMaterial = async (requestId: string, verifiedWeightKg: number) => {
    if (!currentUser || currentUser.role !== "FACILITY" || !Number.isFinite(verifiedWeightKg) || verifiedWeightKg <= 0) throw new Error("Enter a valid received quantity.");
    await verifyCollectedWeight(requestId, verifiedWeightKg);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const redeemReward = async (cost: number) => {
    if (!currentUser || currentUser.role !== "RECYCLER") throw new Error("Only Recycler accounts can request a reward redemption.");
    await requestRewardRedemption(cost);
    await refreshRoleWorkflow(currentUser.id, currentUser.role);
  };

  const handleLogin = async (input: AuthSubmission) => {
    setIsAuthSubmitting(true);
    setAuthError("");
    try {
      const authUser = authMode === "signup"
        ? await registerRecycler({ ...input, displayName: input.displayName ?? "", role: input.role ?? "RECYCLER" })
        : await login({ email: input.email, password: input.password });

      if (authUser.user.role !== "ADMIN") await refreshRoleWorkflow(authUser.user.id, authUser.user.role);

      setCurrentUser({
        id: authUser.user.id,
        displayName: authUser.user.displayName ?? "there",
        email: authUser.user.email,
        role: authUser.user.role,
      });
      setIsAuthenticated(true);
      if (authUser.user.role === "ADMIN") {
        router.replace("/admin");
        return;
      }
      setScreen("dashboard");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setAuthError("");
    try {
      await logout();
      setIsAuthenticated(false);
      setScreen("auth");
      setAuthMode("login");
    } catch (error) {
      if (error instanceof AuthApiError && error.statusCode === 401) {
        setIsAuthenticated(false);
        setScreen("auth");
        return;
      }
      setAuthError(error instanceof Error ? error.message : "Could not sign out. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className={`mx-auto min-h-screen ${currentUser?.role === "ADMIN" ? "max-w-none bg-white" : "max-w-2xl overflow-hidden bg-white shadow-lg"}`}>
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className={`mx-auto flex items-center justify-between px-4 py-2.5 ${currentUser?.role === "ADMIN" ? "max-w-screen-2xl" : "max-w-2xl"}`}>
          <button onClick={goToDashboard} className="flex items-center gap-3">
            <BrandIcon />
            <div className="font-display text-[15px] font-extrabold text-green-800">WasteWise</div>
          </button>

          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              disabled={isAuthSubmitting}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Logout
            </button>
          ) : (
            <button onClick={goToAuth} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700">
              Login / Sign Up
            </button>
          )}
        </div>
      </header>

      {authError && screen !== "auth" && <p role="alert" className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">{authError}</p>}
      {screen === "auth" && <AuthScreen mode={authMode} setMode={(mode) => { setAuthMode(mode); setAuthError(""); }} onLogin={handleLogin} isSubmitting={isAuthSubmitting} errorMessage={authError} />}
      {isAuthenticated && screen === "dashboard" && currentUser && (
        <DashboardScreen
          displayName={currentUser.displayName}
          role={currentUser.role}
          onSearch={(query) => openFind(query)}
          onOpenFind={goToFind}
          onOpenMap={goToMap}
          onSelectLocation={goToDetails}
          onSelectMaterial={(material) => openFind("", material)}
          onOpenDirections={(location) => openDirections(location)}
          onRoleAction={handleRoleAction}
        />
      )}
      {isAuthenticated && screen === "find" && <FindScreen onBack={goToDashboard} onSelect={goToDetails} onMap={() => goToMap()} initialQuery={findInitialQuery} initialMaterial={findInitialMaterial} />}
      {isAuthenticated && screen === "map" && <MapScreen location={selectedLocation} onBack={goToFind} onOpenDetails={() => goToDetails(selectedLocation)} onReport={goToReport} onSelectLocation={setSelectedLocation} />}
      {isAuthenticated && screen === "details" && <DetailsScreen location={selectedLocation} onBack={goToFind} onDirections={() => openDirections(selectedLocation)} isSaved={savedLocationNames.includes(selectedLocation.name)} onToggleSave={() => toggleSavedLocation(selectedLocation)} />}
      {isAuthenticated && screen === "saved" && <SavedScreen locations={savedLocations} onSelect={goToDetails} />}
      {isAuthenticated && screen === "report" && <ReportScreen onBack={() => goToMap()} location={selectedLocation} />}
      {isAuthenticated && currentUser?.role === "RECYCLER" && screen === "collection-request" && <CollectionRequestScreen onBack={goToDashboard} onCreate={createCollectionRequest} />}
      {isAuthenticated && currentUser?.role === "RECYCLER" && screen === "tracking" && <TrackingScreen requests={collectionRequests.filter((request) => request.recyclerId === currentUser.id)} points={pointsBalance} rates={rewardRates} onBack={goToDashboard} onRewards={() => setScreen("rewards")} />}
      {isAuthenticated && currentUser?.role === "RECYCLER" && screen === "rewards" && <RewardsScreen points={pointsBalance} rates={rewardRates} onBack={goToDashboard} onRedeem={redeemReward} />}
      {isAuthenticated && currentUser?.role === "COLLECTOR" && screen === "collector-board" && <CollectorBoardScreen requests={collectionRequests.filter((request) => request.status === "Assigned")} onBack={goToDashboard} onAccept={acceptCollectionRequest} />}
      {isAuthenticated && currentUser?.role === "COLLECTOR" && screen === "collector-pickups" && <CollectorPickupsScreen requests={collectionRequests.filter((request) => request.collectorId === currentUser.id)} onBack={goToDashboard} onRecordCollection={recordCollectedMaterial} onUpdateLocation={updateCollectorCurrentLocation} />}
      {isAuthenticated && currentUser?.role === "FACILITY" && screen === "facility-profile" && <FacilityProfileScreen profile={facilityProfile} onBack={goToDashboard} onSave={saveFacilityProfile} />}
      {isAuthenticated && currentUser?.role === "FACILITY" && screen === "facility-verification" && <FacilityVerificationScreen requests={collectionRequests} profile={facilityProfile} onBack={goToDashboard} onVerify={verifyReceivedMaterial} />}
      </div>
      {isAuthenticated && currentUser && currentUser.role !== "ADMIN" && !["auth", "details", "report"].includes(screen) && (
        <BottomNav active={screen} role={currentUser.role} onNavigate={(target) => {
          if (target === "dashboard") goToDashboard();
          else if (target === "find") goToFind();
          else if (target === "map") goToMap();
          else if (target === "saved") goToSaved();
          else setScreen(target);
        }} />
      )}
    </div>
  );
}
