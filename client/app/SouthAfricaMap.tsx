"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Location } from "./locations";
import { isInsideSouthAfrica, SOUTH_AFRICA_DEFAULT_CENTER, SOUTH_AFRICA_MAP_BOUNDS, SouthAfricaMapLayers } from "./south-africa-map-layers";

const recyclingMarker = L.divIcon({
  className: "wastewise-marker",
  html: "<span aria-hidden=\"true\">♻️</span>",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -36],
});

function RecenterMap({ location }: { location: Location }) {
  const map = useMap();

  useEffect(() => {
    const center = isInsideSouthAfrica(location.latitude, location.longitude)
      ? [location.latitude, location.longitude] as [number, number]
      : SOUTH_AFRICA_DEFAULT_CENTER;
    map.flyTo(center, Math.max(map.getZoom(), 10), { duration: 0.5 });
  }, [location.latitude, location.longitude, map]);

  return null;
}

export default function SouthAfricaMap({
  locations,
  selectedLocation,
  onSelectLocation,
}: {
  locations: Location[];
  selectedLocation: Location;
  onSelectLocation: (location: Location) => void;
}) {
  const center: [number, number] = isInsideSouthAfrica(selectedLocation.latitude, selectedLocation.longitude)
    ? [selectedLocation.latitude, selectedLocation.longitude]
    : SOUTH_AFRICA_DEFAULT_CENTER;

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={10}
        minZoom={5}
        maxBounds={SOUTH_AFRICA_MAP_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SouthAfricaMapLayers />
        <RecenterMap location={selectedLocation} />
        {locations.filter((location) => isInsideSouthAfrica(location.latitude, location.longitude)).map((location) => (
          <Marker
            key={location.name}
            position={[location.latitude, location.longitude]}
            icon={recyclingMarker}
            title={location.name}
            eventHandlers={{ click: () => onSelectLocation(location) }}
          >
            <Popup>
              <div className="min-w-40">
                <p className="font-semibold text-gray-900">{location.name}</p>
                <p className="mt-1 text-xs text-gray-600">{location.shortAddress}</p>
                <button onClick={() => onSelectLocation(location)} className="mt-2 text-xs font-semibold text-green-700">
                  Show facility
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
