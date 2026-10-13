# South Africa-Only Maps

## Goal

Restrict every WasteWise map view to the Republic of South Africa. Do not display neighboring countries or the rest of the world as map content.

## Scope

- Inspect and update the citizen facility map in `client/app/SouthAfricaMap.tsx`.
- Inspect and update the Leaflet maps in `client/app/admin-collections-map.tsx`, including operations, collection tracking, and assignment views.
- Preserve existing markers, popups, filters, selection, and map interactions.
- Do not change collection workflows, API behavior, or data contracts.

## Requirements

- Use a reliable South African national boundary geometry that excludes other sovereign territories, including Lesotho and Eswatini. Include the geometry as a reusable local asset when needed and preserve its data attribution/license.
- Mask or clip the global basemap outside the South African boundary so neighboring countries are not visible. A South Africa-centered viewport or rectangular `maxBounds` alone is not sufficient.
- Constrain panning and zooming to South Africa, with sensible padding around the boundary and a useful initial extent for the current markers.
- Keep existing map markers and popups working. Do not render map records whose coordinates fall outside South Africa.
- Apply the same country restriction to all map views, not only the citizen facility map.
- Keep OpenStreetMap attribution (and any boundary-data attribution) visible as required by the data licenses.
- Do not add a map provider requiring credentials or expose secrets in client code.

## Validation

- Run the client lint and production build, or the narrowest available checks if either is blocked.
- Verify each map initializes, recenters on its existing selected/request location, and remains constrained while panning and zooming.
- Verify South Africa remains visible and neighboring countries are obscured, including on the western, northern, and eastern edges and around Lesotho/Eswatini.
- Verify markers, popups, and existing map filters still work.