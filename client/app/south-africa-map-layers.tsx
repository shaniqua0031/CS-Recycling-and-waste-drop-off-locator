"use client";

import L from "leaflet";
import { GeoJSON, Polygon } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { GeoJsonObject } from "geojson";
import southAfricaBoundary from "./south-africa-boundary.json";

type Coordinate = [number, number];
type MapPosition = [number, number];

const boundaryRings = southAfricaBoundary.geometry.coordinates as Coordinate[][];
const southAfricaOuterRing: MapPosition[] = boundaryRings[0].map(([longitude, latitude]) => [latitude, longitude]);
const worldMaskRing: MapPosition[] = [
  [-80, -90],
  [-80, 90],
  [0, 90],
  [0, -90],
  [-80, -90],
];
const lesothoRings: MapPosition[][] = boundaryRings.slice(1).map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude]));
const mapBounds = L.latLngBounds(southAfricaOuterRing as LatLngExpression[]);
const bounds = mapBounds;

export const SOUTH_AFRICA_MAP_BOUNDS: [[number, number], [number, number]] = [
  [bounds.getSouth(), bounds.getWest()],
  [bounds.getNorth(), bounds.getEast()],
];

export const SOUTH_AFRICA_DEFAULT_CENTER: [number, number] = [-26.2041, 28.0473];

function pointInRing(latitude: number, longitude: number, ring: Coordinate[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    if (crossesLatitude && longitude < ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) / (previousLatitude - currentLatitude) + currentLongitude) {
      inside = !inside;
    }
  }
  return inside;
}

export function isInsideSouthAfrica(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return pointInRing(latitude, longitude, boundaryRings[0])
    && !boundaryRings.slice(1).some((ring) => pointInRing(latitude, longitude, ring));
}

export function isSegmentInsideSouthAfrica(start: MapPosition, end: MapPosition): boolean {
  const sampleCount = 64;
  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const latitude = start[0] + (end[0] - start[0]) * progress;
    const longitude = start[1] + (end[1] - start[1]) * progress;
    if (!isInsideSouthAfrica(latitude, longitude)) return false;
  }
  return true;
}

export function SouthAfricaMapLayers() {
  return (
    <>
      <Polygon
        positions={[worldMaskRing, southAfricaOuterRing]}
        pathOptions={{ color: "#cbd5cd", fillColor: "#dfe6df", fillOpacity: 1, fillRule: "evenodd", weight: 1 }}
        interactive={false}
      />
      {lesothoRings.map((ring, index) => (
        <Polygon
          key={`country-mask-${index}`}
          positions={ring}
          pathOptions={{ color: "#cbd5cd", fillColor: "#dfe6df", fillOpacity: 1, weight: 1 }}
          interactive={false}
        />
      ))}
      <GeoJSON
        data={southAfricaBoundary as GeoJsonObject}
        attribution="South Africa boundary: Natural Earth, public domain"
        style={{ color: "#58775f", fillOpacity: 0, weight: 2 }}
        interactive={false}
      />
    </>
  );
}