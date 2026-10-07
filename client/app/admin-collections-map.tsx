"use client";

import { Fragment, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { CollectionRecord, CollectorCandidate } from "../lib/dashboard-api";

const defaultCenter: [number, number] = [-26.2041, 28.0473];

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
