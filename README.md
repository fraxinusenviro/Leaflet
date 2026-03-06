# Leaflet Field Mapper

A lightweight static Leaflet app for field mapping on desktop/mobile with:

- Multiple basemaps (default **Esri Imagery**, plus OSM, Esri Topo, Carto Positron)
- Sketch drawing/editing/deleting for points, lines, polygons
- GPS capture (live position, add GPS point, line/polygon recording)
- GeoJSON import/export
- Local persistence via `localStorage`

## Run locally

Because geolocation works best on secure origins, prefer localhost serving:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

> Opening `index.html` directly can work for sketch/import/export, but GPS may be blocked in some browsers.

## Host on GitHub Pages

1. Push this repository to GitHub.
2. In repository settings, open **Pages**.
3. Set source branch to your default branch (root).
4. Save, then open the published URL.

No build step is required; this is a static app.

## Feature behavior

- Default map view is centered around Nova Scotia for quick regional startup.
- Basemap choice is persisted in `localStorage`.
- Tools toggle is in Leaflet controls (below zoom and above draw tools).
- Draw/edit/delete events auto-save a GeoJSON `FeatureCollection` in `localStorage`.
- Attributes editable per selected feature:
  - `name`
  - `type`
  - `notes`
  - timestamp fields: `created_at` and `updated_at`
- Layer styling controls can apply stroke/fill/width/opacity/radius changes to selected features or all features.
- GPS recording supports configurable min-distance, min-interval, and max-accuracy filters.
- Line and polygon recordings create final features on stop (polygon requires >= 3 unique points and closes ring automatically).

## Known limitations

- GPS quality depends on device hardware, sky view, and browser permission handling.
- Imported features are normalized and styled for editing; advanced custom styles are not preserved.
- Topology checks are basic (for example, no advanced self-intersection repair workflow).
