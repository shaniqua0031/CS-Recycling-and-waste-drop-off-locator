"use client";

import { Fragment, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { AdminCollector, AdminFacility, AdminIncident, CollectionRecord, CollectorCandidate } from "../lib/dashboard-api";

const defaultCenter: [number, number] = [-26.2041, 28.0473];

type AdminMapFilter = "All" | "Collectors" | "Facilities" | "Requests" | "Incidents" | "Critical";

export function AdminOperationsMap({ requests, collectors, facilities, incidents }: {
  requests: CollectionRecord[];
  collectors: AdminCollector[];
  facilities: AdminFacility[];
  incidents: AdminIncident[];
}) {
  const [filter, setFilter] = useState<AdminMapFilter>("All");
  const filters: AdminMapFilter[] = ["All", "Collectors", "Facilities", "Requests", "Incidents", "Critical"];
  const center = useMemo<[number, number]>(() => {
    const incident = incidents.find((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    if (incident) return [incident.latitude, incident.longitude];
    const request = requests.find((item) => Number.isFinite(item.pickupLatitude) && Number.isFinite(item.pickupLongitude));
    if (request) return [request.pickupLatitude, request.pickupLongitude];
    const facility = facilities.find((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    if (facility) return [facility.latitude, facility.longitude];
    const collector = collectors.find((item) => item.currentLatitude !== null && item.currentLongitude !== null);
    return collector?.currentLatitude !== null && collector?.currentLatitude !== undefined && collector.currentLongitude !== null
      ? [collector.currentLatitude, collector.currentLongitude]
      : defaultCenter;
  }, [collectors, facilities, incidents, requests]);
  const show = (kind: Exclude<AdminMapFilter, "All" | "Critical">) => filter === "All" || filter === kind || (filter === "Critical" && (kind === "Requests" || kind === "Incidents"));
  const showCritical = filter === "Critical";

  return <div className="space-y-2">
    <div role="group" aria-label="Map filters" className="flex flex-wrap gap-1">
      {filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${filter === item ? "border-emerald-800 bg-emerald-800 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{item}</button>)}
    </div>
    <div className="h-[420px] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={center} zoom={10} minZoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {show("Requests") && requests.filter((request) => !showCritical || request.priority === "CRITICAL").map((request) => <CircleMarker key={`request-${request.id}`} center={[request.pickupLatitude, request.pickupLongitude]} radius={8} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9 }}><Popup><strong>Collection request</strong><br />{request.material.name}<br />{formatMapStatus(request.status)}<br />{request.pickupAddress}</Popup></CircleMarker>)}
        {show("Collectors") && collectors.filter((collector) => collector.currentLatitude !== null && collector.currentLongitude !== null).map((collector) => <CircleMarker key={`collector-${collector.id}`} center={[collector.currentLatitude!, collector.currentLongitude!]} radius={8} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.9 }}><Popup><strong>{collector.displayName}</strong><br />{formatMapStatus(collector.availability)}<br />Last stored location, not live tracking<br />{collector.lastLocationUpdatedAt ? new Date(collector.lastLocationUpdatedAt).toLocaleString() : "Time unavailable"}</Popup></CircleMarker>)}
        {show("Facilities") && facilities.map((facility) => <CircleMarker key={`facility-${facility.id}`} center={[facility.latitude, facility.longitude]} radius={9} pathOptions={{ color: "#334155", fillColor: "#64748b", fillOpacity: 0.9 }}><Popup><strong>{facility.name}</strong><br />{formatMapStatus(facility.operationalStatus)}<br />{facility.address}</Popup></CircleMarker>)}
        {show("Incidents") && incidents.filter((incident) => !showCritical || incident.priority === "CRITICAL").map((incident) => <CircleMarker key={`incident-${incident.id}`} center={[incident.latitude, incident.longitude]} radius={9} pathOptions={{ color: incident.priority === "CRITICAL" ? "#be123c" : "#c2410c", fillColor: incident.priority === "CRITICAL" ? "#f43f5e" : "#fb923c", fillOpacity: 0.9 }}><Popup><strong>{formatMapStatus(incident.priority)} incident</strong><br />{formatMapStatus(incident.type)}<br />Reports: {incident.reportCount}<br />{incident.facility?.name ?? "Community location"}</Popup></CircleMarker>)}
      </MapContainer>
    </div>
  </div>;
}

function formatMapStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function AdminCollectionsMap({ requests }: { requests: CollectionRecord[] }) {
  const center = useMemo<[number, number]>(() => {
    const firstRequest = requests.find((request) => Number.isFinite(request.pickupLatitude) && Number.isFinite(request.pickupLongitude));
    return firstRequest ? [firstRequest.pickupLatitude, firstRequest.pickupLongitude] : defaultCenter;
  }, [requests]);

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={center} zoom={10} minZoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {requests.map((request) => {
          const assignment = request.assignments[0];
          const collector = assignment?.collector;
          const hasCollectorLocation = collector?.currentLatitude !== null && collector?.currentLatitude !== undefined && collector?.currentLongitude !== null && collector?.currentLongitude !== undefined;
          const requesterPosition: [number, number] = [request.pickupLatitude, request.pickupLongitude];
          const collectorPosition: [number, number] | null = hasCollectorLocation
            ? [collector.currentLatitude!, collector.currentLongitude!]
            : null;
          const collectorName = collector?.user.recyclerProfile?.displayName ?? collector?.user.email ?? "Assigned collector";

          return (
            <Fragment key={request.id}>
              <CircleMarker center={requesterPosition} radius={8} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9 }}>
                <Popup>
                  <strong>Pickup: {request.material.name}</strong><br />
                  {request.pickupAddress}<br />
                  Status: {request.status.replaceAll("_", " ")}
                </Popup>
              </CircleMarker>
              {collectorPosition && <>
                <Polyline positions={[requesterPosition, collectorPosition]} pathOptions={{ color: "#0f766e", dashArray: "5 6" }} />
                <CircleMarker center={collectorPosition} radius={8} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{collectorName}</strong><br />
                    Last known collector location<br />
                    {collector?.lastLocationUpdatedAt ? new Date(collector.lastLocationUpdatedAt).toLocaleString() : "Update time unavailable"}
                  </Popup>
                </CircleMarker>
              </>}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

export function CollectionTrackingMap({ request }: { request: {
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  material: string;
  collectorLatitude?: number | null;
  collectorLongitude?: number | null;
  collectorLocationUpdatedAt?: string | null;
  collectorName?: string;
} }) {
  const pickupPosition: [number, number] = [request.pickupLatitude, request.pickupLongitude];
  const hasCollectorLocation = request.collectorLatitude !== null && request.collectorLatitude !== undefined && request.collectorLongitude !== null && request.collectorLongitude !== undefined;
  const collectorPosition: [number, number] | null = hasCollectorLocation
    ? [request.collectorLatitude!, request.collectorLongitude!]
    : null;

  return (
    <div className="mt-3 h-[280px] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={collectorPosition ?? pickupPosition} zoom={10} minZoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker center={pickupPosition} radius={9} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.95 }}>
          <Popup><strong>{request.material} pickup</strong><br />{request.pickupAddress}</Popup>
        </CircleMarker>
        {collectorPosition && <>
          <Polyline positions={[pickupPosition, collectorPosition]} pathOptions={{ color: "#0f766e", dashArray: "5 6" }} />
          <CircleMarker center={collectorPosition} radius={8} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.9 }}>
            <Popup><strong>{request.collectorName ?? "Assigned Collector"}</strong><br />Last-known location<br />{request.collectorLocationUpdatedAt ? new Date(request.collectorLocationUpdatedAt).toLocaleString() : "Update time unavailable"}</Popup>
          </CircleMarker>
        </>}
      </MapContainer>
    </div>
  );
}

export function AdminAssignmentMap({ request, candidates }: { request: CollectionRecord; candidates: CollectorCandidate[] }) {
  return (
    <div className="mb-4 h-[280px] w-full overflow-hidden rounded-lg border border-gray-200">
      <MapContainer center={[request.pickupLatitude, request.pickupLongitude]} zoom={11} minZoom={6} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker center={[request.pickupLatitude, request.pickupLongitude]} radius={10} pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.95 }}>
          <Popup><strong>Recycler pickup</strong><br />{request.pickupAddress}</Popup>
        </CircleMarker>
        {candidates.map((candidate) => {
          const latitude = candidate.locationSource === "CURRENT" ? candidate.currentLatitude : candidate.serviceCenterLatitude;
          const longitude = candidate.locationSource === "CURRENT" ? candidate.currentLongitude : candidate.serviceCenterLongitude;
          if (latitude === null || longitude === null) return null;
          return <CircleMarker key={candidate.profileId} center={[latitude, longitude]} radius={8} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.9 }}>
            <Popup><strong>{candidate.displayName ?? candidate.email}</strong><br />{candidate.distanceKm.toFixed(1)} km · approx. {candidate.etaMinutes} min<br />{candidate.locationSource === "CURRENT" ? "Recent location" : "Service center"}<br />{candidate.activeWorkload} active pickups</Popup>
          </CircleMarker>;
        })}
      </MapContainer>
    </div>
  );
}
