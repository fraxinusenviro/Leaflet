const STORAGE_KEYS = {
  basemap: 'leaflet-fieldmapper-basemap',
  features: 'leaflet-fieldmapper-features'
};

const basemapConfigs = {
  osm: {
    label: 'OpenStreetMap Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
  },
  esriImagery: {
    label: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { attribution: 'Tiles &copy; Esri' }
  },
  esriTopo: {
    label: 'Esri World Topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options: { attribution: 'Tiles &copy; Esri' }
  },
  cartoPositron: {
    label: 'Carto Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: { attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: 'abcd', maxZoom: 20 }
  }
};

const dom = {
  basemapSelect: document.getElementById('basemapSelect'),
  toolbar: document.getElementById('toolbar'),
  toolbarToggle: document.getElementById('toolbarToggle'),
  attributeForm: document.getElementById('attributeForm'),
  attrName: document.getElementById('attrName'),
  attrType: document.getElementById('attrType'),
  attrNotes: document.getElementById('attrNotes'),
  featureMeta: document.getElementById('featureMeta'),
  enableGpsBtn: document.getElementById('enableGpsBtn'),
  addGpsPointBtn: document.getElementById('addGpsPointBtn'),
  startLineBtn: document.getElementById('startLineBtn'),
  startPolygonBtn: document.getElementById('startPolygonBtn'),
  stopRecordingBtn: document.getElementById('stopRecordingBtn'),
  gpsStatus: document.getElementById('gpsStatus'),
  minDistance: document.getElementById('minDistance'),
  minInterval: document.getElementById('minInterval'),
  maxAccuracy: document.getElementById('maxAccuracy'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  mergeImport: document.getElementById('mergeImport'),
  clearBtn: document.getElementById('clearBtn'),
  statusBar: document.getElementById('statusBar')
};

const map = L.map('map').setView([20, 0], 2);
const drawnItems = new L.FeatureGroup().addTo(map);
const featureIndex = new Map();

let activeBasemapKey = null;
let activeBasemapLayer = null;
let selectedLayer = null;

const gpsState = {
  watchId: null,
  enabled: false,
  latestLatLng: null,
  latestAccuracy: null,
  marker: null,
  circle: null,
  recordingMode: null,
  recordPoints: [],
  acceptedCount: 0,
  lastAcceptedAt: 0
};

function setStatusBar(text) {
  dom.statusBar.textContent = text;
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function ensureFeatureProperties(properties = {}, source = 'sketch') {
  const timestamp = nowIso();
  return {
    id: properties.id || generateId(),
    name: properties.name || '',
    type: properties.type || '',
    notes: properties.notes || '',
    created_at: properties.created_at || timestamp,
    updated_at: timestamp,
    source: properties.source || source
  };
}

function populateBasemapOptions() {
  Object.entries(basemapConfigs).forEach(([key, cfg]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = cfg.label;
    dom.basemapSelect.appendChild(option);
  });
}

function switchBasemap(key) {
  if (!basemapConfigs[key]) {
    return;
  }
  if (activeBasemapLayer) {
    map.removeLayer(activeBasemapLayer);
  }
  activeBasemapLayer = L.tileLayer(basemapConfigs[key].url, basemapConfigs[key].options);
  activeBasemapLayer.addTo(map);
  activeBasemapKey = key;
  localStorage.setItem(STORAGE_KEYS.basemap, key);
}

function serializeFeatures() {
  return {
    type: 'FeatureCollection',
    features: [...featureIndex.values()]
  };
}

function persistFeatures() {
  localStorage.setItem(STORAGE_KEYS.features, JSON.stringify(serializeFeatures()));
}

function bindLayerEvents(layer) {
  layer.on('click', () => {
    selectedLayer = layer;
    loadSelectedAttributes();
    showMeasurements(layer);
  });
}

function upsertFeatureFromLayer(layer, source = 'sketch') {
  const gj = layer.toGeoJSON();
  const existingId = layer.feature?.properties?.id;
  const known = existingId ? featureIndex.get(existingId) : null;
  const props = ensureFeatureProperties(
    {
      ...known?.properties,
      ...layer.feature?.properties,
      ...gj.properties
    },
    source
  );

  if (known && known.properties.created_at) {
    props.created_at = known.properties.created_at;
  }

  const feature = {
    type: 'Feature',
    properties: props,
    geometry: gj.geometry
  };

  layer.feature = feature;
  featureIndex.set(props.id, feature);
  bindLayerEvents(layer);
}

function clearLayersAndIndex() {
  drawnItems.clearLayers();
  featureIndex.clear();
  selectedLayer = null;
  dom.attributeForm.reset();
  dom.featureMeta.textContent = 'Select a feature to edit attributes.';
}

function renderFeatureCollection(collection) {
  clearLayersAndIndex();

  L.geoJSON(collection, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 7,
      weight: 2,
      fillOpacity: 0.75,
      color: '#0b57d0',
      fillColor: '#4f8cff'
    }),
    style: () => ({ color: '#0b57d0', weight: 3, fillColor: '#4f8cff', fillOpacity: 0.2 }),
    onEachFeature: (feature, layer) => {
      layer.feature = {
        ...feature,
        properties: ensureFeatureProperties(feature.properties, feature.properties?.source || 'sketch')
      };
      bindLayerEvents(layer);
      drawnItems.addLayer(layer);
      featureIndex.set(layer.feature.properties.id, layer.feature);
    }
  });
}

function loadStoredFeatures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.features);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      renderFeatureCollection(parsed);
      if (drawnItems.getLayers().length) {
        map.fitBounds(drawnItems.getBounds(), { padding: [20, 20] });
      }
      persistFeatures();
    }
  } catch (err) {
    console.warn('Could not load stored features', err);
  }
}

function initializeBasemap() {
  populateBasemapOptions();
  const stored = localStorage.getItem(STORAGE_KEYS.basemap);
  const initial = stored && basemapConfigs[stored] ? stored : 'osm';
  dom.basemapSelect.value = initial;
  switchBasemap(initial);
}

function loadSelectedAttributes() {
  if (!selectedLayer || !selectedLayer.feature) {
    dom.featureMeta.textContent = 'Select a feature to edit attributes.';
    return;
  }
  const props = selectedLayer.feature.properties;
  dom.attrName.value = props.name || '';
  dom.attrType.value = props.type || '';
  dom.attrNotes.value = props.notes || '';
  dom.featureMeta.textContent = `Selected: ${props.id} (${selectedLayer.feature.geometry.type})`;
}

function showMeasurements(layer) {
  if (!layer?.feature) {
    return;
  }
  const feature = layer.toGeoJSON();
  const geomType = feature.geometry.type;
  if (geomType === 'LineString') {
    const length = turf.length(feature, { units: 'kilometers' }) * 1000;
    dom.featureMeta.textContent += ` | Length: ${length.toFixed(1)} m`;
  }
  if (geomType === 'Polygon') {
    const area = turf.area(feature);
    const perimeter = turf.length(turf.polygonToLine(feature), { units: 'kilometers' }) * 1000;
    dom.featureMeta.textContent += ` | Area: ${area.toFixed(1)} m², Perimeter: ${perimeter.toFixed(1)} m`;
  }
}

function handleDrawCreate(event) {
  const layer = event.layer;
  drawnItems.addLayer(layer);
  upsertFeatureFromLayer(layer, 'sketch');
  persistFeatures();
}

function handleDrawEdit(event) {
  event.layers.eachLayer((layer) => {
    if (!layer.feature) {
      return;
    }
    const props = layer.feature.properties || {};
    props.updated_at = nowIso();
    layer.feature.properties = props;
    upsertFeatureFromLayer(layer, props.source || 'sketch');
  });
  persistFeatures();
}

function handleDrawDelete(event) {
  event.layers.eachLayer((layer) => {
    const id = layer.feature?.properties?.id;
    if (id) {
      featureIndex.delete(id);
    }
  });
  persistFeatures();
  selectedLayer = null;
  dom.featureMeta.textContent = 'Feature deleted.';
}

function gpsSupportsAvailable() {
  return 'geolocation' in navigator;
}

function updateGpsButtons() {
  const active = gpsState.enabled;
  dom.addGpsPointBtn.disabled = !active;
  dom.startLineBtn.disabled = !active || gpsState.recordingMode !== null;
  dom.startPolygonBtn.disabled = !active || gpsState.recordingMode !== null;
  dom.stopRecordingBtn.disabled = gpsState.recordingMode === null;
}

function updateGpsStatus(extra = '') {
  const accuracy = gpsState.latestAccuracy != null ? `${gpsState.latestAccuracy.toFixed(1)} m` : 'n/a';
  const base = gpsState.enabled ? 'GPS active' : 'GPS inactive';
  const recording = gpsState.recordingMode ? ` | recording ${gpsState.recordingMode} (${gpsState.acceptedCount} pts)` : '';
  dom.gpsStatus.textContent = `${base} | accuracy: ${accuracy}${recording}${extra ? ` | ${extra}` : ''}`;
  setStatusBar(`Mode: ${gpsState.recordingMode ? `GPS ${gpsState.recordingMode}` : 'Sketch'} | GPS: ${gpsState.enabled ? `active (${accuracy})` : 'inactive'}`);
}

function applyGpsFix(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latlng = L.latLng(latitude, longitude);
  gpsState.latestLatLng = latlng;
  gpsState.latestAccuracy = accuracy;

  if (!gpsState.marker) {
    gpsState.marker = L.circleMarker(latlng, { radius: 6, color: '#0b57d0', fillColor: '#4f8cff', fillOpacity: 1 }).addTo(map);
  } else {
    gpsState.marker.setLatLng(latlng);
  }

  if (!gpsState.circle) {
    gpsState.circle = L.circle(latlng, { radius: accuracy, color: '#0b57d0', fillOpacity: 0.08 }).addTo(map);
  } else {
    gpsState.circle.setLatLng(latlng);
    gpsState.circle.setRadius(accuracy);
  }

  maybeRecordGpsPoint(latlng, accuracy);
  updateGpsStatus();
}

function maybeRecordGpsPoint(latlng, accuracy) {
  if (!gpsState.recordingMode) {
    return;
  }
  const minDistance = Number(dom.minDistance.value) || 0;
  const minIntervalMs = (Number(dom.minInterval.value) || 0) * 1000;
  const maxAccuracy = Number(dom.maxAccuracy.value) || Infinity;

  if (accuracy > maxAccuracy) {
    updateGpsStatus('point ignored due to low accuracy');
    return;
  }

  const now = Date.now();
  if (gpsState.lastAcceptedAt && now - gpsState.lastAcceptedAt < minIntervalMs) {
    return;
  }

  const prev = gpsState.recordPoints[gpsState.recordPoints.length - 1];
  if (prev && map.distance(prev, latlng) < minDistance) {
    return;
  }

  gpsState.recordPoints.push(latlng);
  gpsState.acceptedCount += 1;
  gpsState.lastAcceptedAt = now;
  updateGpsStatus();
}

function enableGps() {
  if (!gpsSupportsAvailable()) {
    alert('Geolocation is not supported by this browser.');
    return;
  }

  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    alert('Geolocation usually requires HTTPS. Use https:// or localhost for best results.');
  }

  gpsState.watchId = navigator.geolocation.watchPosition(
    applyGpsFix,
    (error) => updateGpsStatus(`error: ${error.message}`),
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000
    }
  );

  gpsState.enabled = true;
  updateGpsButtons();
  updateGpsStatus();
}

function createFeatureFromCoordinates(type, latlngs, source = 'gps') {
  let layer;
  if (type === 'Point') {
    layer = L.circleMarker(latlngs, { radius: 7, weight: 2, fillOpacity: 0.75, color: '#0b57d0', fillColor: '#4f8cff' });
  } else if (type === 'LineString') {
    layer = L.polyline(latlngs, { color: '#0b57d0', weight: 3 });
  } else {
    layer = L.polygon(latlngs, { color: '#0b57d0', weight: 3, fillOpacity: 0.2, fillColor: '#4f8cff' });
  }

  drawnItems.addLayer(layer);
  upsertFeatureFromLayer(layer, source);
  persistFeatures();
}

function startRecording(mode) {
  if (!gpsState.enabled) {
    alert('Enable GPS first.');
    return;
  }
  gpsState.recordingMode = mode;
  gpsState.recordPoints = [];
  gpsState.acceptedCount = 0;
  gpsState.lastAcceptedAt = 0;
  updateGpsButtons();
  updateGpsStatus();
}

function stopRecording() {
  const mode = gpsState.recordingMode;
  const points = gpsState.recordPoints.slice();
  gpsState.recordingMode = null;
  gpsState.recordPoints = [];
  gpsState.acceptedCount = 0;
  gpsState.lastAcceptedAt = 0;

  if (mode === 'line' && points.length >= 2) {
    createFeatureFromCoordinates('LineString', points, 'gps');
  } else if (mode === 'polygon') {
    const unique = points.filter((p, i) => i === 0 || !p.equals(points[i - 1]));
    if (unique.length >= 3) {
      const first = unique[0];
      const last = unique[unique.length - 1];
      if (!first.equals(last)) {
        unique.push(first);
      }
      createFeatureFromCoordinates('Polygon', unique, 'gps');
    } else {
      alert('Not enough unique points for a polygon. Recording discarded.');
    }
  }

  updateGpsButtons();
  updateGpsStatus();
}

function addGpsPoint() {
  if (!gpsState.latestLatLng) {
    alert('No GPS fix yet.');
    return;
  }
  createFeatureFromCoordinates('Point', gpsState.latestLatLng, 'gps');
}

function downloadGeoJSON() {
  const data = serializeFeatures();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field-mapper-${Date.now()}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

function validateFeatureCollection(candidate) {
  return (
    candidate &&
    candidate.type === 'FeatureCollection' &&
    Array.isArray(candidate.features) &&
    candidate.features.every((f) => f.type === 'Feature' && f.geometry)
  );
}

async function importGeoJSONFile(file, merge) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    alert('Invalid JSON file.');
    return;
  }

  if (!validateFeatureCollection(parsed)) {
    alert('Unsupported GeoJSON. Please provide a FeatureCollection.');
    return;
  }

  if (merge) {
    const current = serializeFeatures();
    parsed.features = current.features.concat(parsed.features);
  }

  renderFeatureCollection(parsed);
  persistFeatures();
  if (drawnItems.getLayers().length) {
    map.fitBounds(drawnItems.getBounds(), { padding: [20, 20] });
  }
}

function wireEvents() {
  dom.basemapSelect.addEventListener('change', (event) => switchBasemap(event.target.value));

  dom.toolbarToggle.addEventListener('click', () => {
    dom.toolbar.classList.toggle('collapsed');
    const expanded = !dom.toolbar.classList.contains('collapsed');
    dom.toolbarToggle.setAttribute('aria-expanded', String(expanded));
  });

  dom.attributeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedLayer || !selectedLayer.feature) {
      alert('Select a feature first.');
      return;
    }

    selectedLayer.feature.properties.name = dom.attrName.value.trim();
    selectedLayer.feature.properties.type = dom.attrType.value.trim();
    selectedLayer.feature.properties.notes = dom.attrNotes.value.trim();
    selectedLayer.feature.properties.updated_at = nowIso();
    upsertFeatureFromLayer(selectedLayer, selectedLayer.feature.properties.source || 'sketch');
    persistFeatures();
    showMeasurements(selectedLayer);
  });

  dom.enableGpsBtn.addEventListener('click', enableGps);
  dom.addGpsPointBtn.addEventListener('click', addGpsPoint);
  dom.startLineBtn.addEventListener('click', () => startRecording('line'));
  dom.startPolygonBtn.addEventListener('click', () => startRecording('polygon'));
  dom.stopRecordingBtn.addEventListener('click', stopRecording);

  dom.exportBtn.addEventListener('click', downloadGeoJSON);
  dom.importInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      importGeoJSONFile(file, dom.mergeImport.checked);
    }
    dom.importInput.value = '';
  });

  dom.clearBtn.addEventListener('click', () => {
    if (!confirm('Clear all features? This cannot be undone.')) {
      return;
    }
    clearLayersAndIndex();
    persistFeatures();
  });

  map.on(L.Draw.Event.CREATED, handleDrawCreate);
  map.on(L.Draw.Event.EDITED, handleDrawEdit);
  map.on(L.Draw.Event.DELETED, handleDrawDelete);
}

function initializeDrawControls() {
  const drawControl = new L.Control.Draw({
    draw: {
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: true,
      polyline: true,
      polygon: { allowIntersection: false, showArea: true }
    },
    edit: {
      featureGroup: drawnItems,
      remove: true
    }
  });
  map.addControl(drawControl);
}

function bootstrap() {
  initializeBasemap();
  initializeDrawControls();
  wireEvents();
  loadStoredFeatures();
  updateGpsButtons();
  updateGpsStatus();
}

bootstrap();
