import "@arcgis/core/assets/esri/themes/dark/main.css";
import "./style.css";

import esriConfig from "@arcgis/core/config";
import Map from "@arcgis/core/Map";
import Basemap from "@arcgis/core/Basemap";
import MapView from "@arcgis/core/views/MapView";
import TileLayer from "@arcgis/core/layers/TileLayer";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import Polyline from "@arcgis/core/geometry/Polyline";
import Circle from "@arcgis/core/geometry/Circle";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import { MapAudio } from "./audio.js";
import {
  isWater, elevationToFrequency, quantizePentatonic, frequencyToNote, screenXToPan,
  haversineKm, bearingDeg, compassWord, quakeToPing, describeProfile, fmtM, clamp
} from "./sonify.js";

// Optional: an API key unlocks Esri basemap styles. Everything here works without one.
if (import.meta.env.VITE_ARCGIS_API_KEY) esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;

const ELEVATION_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const HILLSHADE_URL = "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer";
const PLACES_URL = "https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer";
const QUAKES_URL = "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USGS_Seismic_Data_v1/FeatureServer/0";
const NO_DATA = -99999;

const PLACES = {
  sierra:   { label: "Sierra Nevada to Death Valley, California", center: [-117.6, 36.4], zoom: 8 },
  bengal:   { label: "Bengal delta to the Himalaya", center: [89.5, 25.2], zoom: 6 },
  japan:    { label: "Japan and the Pacific trenches", center: [139.5, 36.5], zoom: 6 },
  andes:    { label: "Andes and the Atacama", center: [-69.5, -23.5], zoom: 6 },
  alaska:   { label: "Alaska and the Aleutian arc", center: [-152, 60], zoom: 5 }
};

// dom
const $ = id => document.getElementById(id);
const live = $("live");
const ui = {
  elev: $("rElev"), note: $("rNote"), pan: $("rPan"), coord: $("rCoord"),
  quake: $("rQuake"), status: $("status"), profile: $("profileSvg"), profileText: $("profileText")
};

// map
const elevation = new ElevationLayer({ url: ELEVATION_URL });

const quakes = new FeatureLayer({
  url: QUAKES_URL,
  title: "Earthquakes (USGS, past 30 days)",
  outFields: ["mag", "place", "depth", "eventTime"],
  renderer: {
    type: "simple",
    symbol: { type: "simple-marker", color: [255, 92, 160, 0.75], outline: { color: [255, 255, 255, 0.9], width: 0.6 } },
    visualVariables: [{ type: "size", field: "mag", stops: [{ value: 1, size: 3 }, { value: 4, size: 10 }, { value: 7, size: 34 }] }]
  },
  popupTemplate: {
    title: "M{mag} earthquake",
    content: "{place}<br>Depth: {depth} km<br>{eventTime}",
    fieldInfos: [{ fieldName: "eventTime", format: { dateFormat: "short-date-short-time" } }]
  }
});

const map = new Map({
  basemap: new Basemap({
    baseLayers: [new TileLayer({ url: HILLSHADE_URL })],
    referenceLayers: [new TileLayer({ url: PLACES_URL, opacity: 0.8 })]
  }),
  layers: [quakes]
});

const view = new MapView({
  container: "viewDiv",
  map,
  center: PLACES.sierra.center,
  zoom: PLACES.sierra.zoom,
  constraints: { minZoom: 3 }
});

const audio = new MapAudio();
const state = {
  musical: false,       // snap pitches to a pentatonic scale
  speak: false,         // also read announcements aloud with speech synthesis
  sampler: null,        // ElevationSampler for the current extent: hover is then synchronous
  samplerAbort: null,
  listenPoint: null,    // last point the user "listened" to (pointer or keyboard)
  quakeView: null,
  lastInput: "pointer"
};

// announcements (screen readers + optional speech)
function announce(text) {
  live.textContent = "";
  // Re-set on the next frame so repeated identical messages are still read.
  requestAnimationFrame(() => { live.textContent = text; });
  if (state.speak && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }
}

function setStatus(text) { ui.status.textContent = text; }

// elevation
// When the view stops moving, build an ElevationSampler for the visible extent.
// Hover lookups after that are synchronous, no requests.
async function refreshSampler() {
  if (!view.ready || !view.extent) return;
  state.samplerAbort?.abort();
  const ctrl = new AbortController();
  state.samplerAbort = ctrl;
  setStatus("Loading terrain for this view…");
  try {
    await elevation.load({ signal: ctrl.signal });
    const sampler = await elevation.createElevationSampler(view.extent.clone().expand(1.25), {
      demResolution: "auto", noDataValue: NO_DATA, signal: ctrl.signal
    });
    if (ctrl.signal.aborted) return;
    state.sampler = sampler;
    setStatus("Terrain ready. Move over the map to listen.");
  } catch (err) {
    if (err?.name !== "AbortError") { console.warn(err); setStatus("Terrain sampler unavailable; using live queries."); }
  }
}

let inflight = false, pending = null;
/** Elevation at a map point: sync via sampler when possible, otherwise a live query. */
async function elevationAt(mapPoint) {
  const s = state.sampler;
  if (s && s.extent?.contains(mapPoint)) {
    const z = s.spatialReference.equals(mapPoint.spatialReference)
      ? s.elevationAt(mapPoint.x, mapPoint.y)
      : s.queryElevation(mapPoint)?.z;
    return z === NO_DATA ? NaN : z;
  }
  // Fallback while the sampler is loading: one query in flight, latest point wins.
  if (inflight) { pending = mapPoint; return undefined; }
  inflight = true;
  try {
    const r = await elevation.queryElevation(mapPoint, { demResolution: "auto", noDataValue: NO_DATA });
    const z = r.geometry.z;
    return z === NO_DATA ? NaN : z;
  } catch { return NaN; }
  finally {
    inflight = false;
    if (pending) { const p = pending; pending = null; listenAt(p, view.toScreen(p)); }
  }
}

function pitchFor(z) {
  const f = elevationToFrequency(z);
  return state.musical ? quantizePentatonic(f) : f;
}

async function listenAt(mapPoint, screenPoint) {
  if (!mapPoint) return;
  state.listenPoint = mapPoint;
  const z = await elevationAt(mapPoint);
  if (z === undefined) return; // superseded by a newer point
  const pan = screenXToPan(screenPoint?.x ?? view.width / 2, view.width);
  const water = isWater(z);
  const freq = water ? 0 : pitchFor(z);
  audio.terrain({ freq, pan, water });

  ui.elev.textContent = Number.isFinite(z) ? `${fmtM(z)} · ${Math.round(z * 3.28084).toLocaleString("en-US")} ft` : "no data";
  ui.note.textContent = water ? "water / sea level" : `${frequencyToNote(freq)} · ${Math.round(freq)} Hz`;
  ui.pan.textContent = pan < -0.15 ? `left ${Math.round(-pan * 100)}%` : pan > 0.15 ? `right ${Math.round(pan * 100)}%` : "center";
  ui.coord.textContent = `${mapPoint.latitude.toFixed(3)}°, ${mapPoint.longitude.toFixed(3)}°`;
  return z;
}

// pointer listening
view.on("pointer-move", e => {
  if (!audio.ready) return;
  state.lastInput = "pointer";
  listenAt(view.toMap(e), { x: e.x, y: e.y });
});
view.on("pointer-leave", () => audio.silence());
view.on("click", e => {
  if (!audio.ready) return;
  quakeSonar(view.toMap(e));
});

// Keyboard users pan with the arrow keys; the crosshair at the center is their "ear".
view.on("key-down", e => {
  if (e.key.startsWith("Arrow") || e.key === "+" || e.key === "-") state.lastInput = "keyboard";
});
reactiveUtils.when(() => view.stationary, async () => {
  refreshSampler();
  if (audio.ready && state.lastInput === "keyboard") {
    const z = await listenAt(view.center, { x: view.width / 2, y: view.height / 2 });
    if (z !== undefined) announce(isWater(z) ? "Center: water or sea level." : `Center: ${fmtM(z)}.`);
  }
});

// profile sweep: hear the whole view left to right
const SWEEP_SAMPLES = 64, SWEEP_SECONDS = 3.2;
const sweepGraphic = new Graphic({ symbol: { type: "simple-line", color: [255, 214, 10, 0.9], width: 2, style: "short-dash" } });
const headGraphic = new Graphic({ symbol: { type: "simple-marker", color: [255, 214, 10, 1], size: 12, outline: { color: "white", width: 1.5 } } });
let sweepTimer = 0, sweepCleanup = 0;

async function sweep() {
  if (!audio.ready) return;
  const y = view.height / 2;
  const pts = Array.from({ length: SWEEP_SAMPLES }, (_, i) => view.toMap({ x: (i / (SWEEP_SAMPLES - 1)) * view.width, y }));
  const mp = new Multipoint({ points: pts.map(p => [p.x, p.y]), spatialReference: view.spatialReference });

  setStatus("Sweeping the view from west to east…");
  let zs;
  try {
    const s = state.sampler;
    const res = s && s.extent?.contains(view.extent) ? s.queryElevation(mp)
      : (await elevation.queryElevation(mp, { demResolution: "auto", noDataValue: NO_DATA })).geometry;
    zs = res.points.map(p => (p[2] === NO_DATA ? NaN : p[2]));
  } catch (err) { console.warn(err); setStatus("Could not read elevation for this view."); return; }

  const { hi, lo, summary } = describeProfile(zs);
  drawProfile(zs, hi, lo);
  ui.profileText.textContent = summary;

  // Show the sweep line and a moving playhead on the map.
  sweepGraphic.geometry = new Polyline({ paths: [pts.map(p => [p.x, p.y])], spatialReference: view.spatialReference });
  view.graphics.addMany([sweepGraphic, headGraphic]);

  const step = SWEEP_SECONDS / SWEEP_SAMPLES;
  audio.silence();
  zs.forEach((z, i) => {
    const pan = (i / (SWEEP_SAMPLES - 1)) * 2 - 1;
    if (isWater(z)) audio.splash({ pan, delayS: i * step });
    else {
      const accent = (hi && i === hi.i) || (lo && i === lo.i && !isWater(lo.e));
      audio.ping({ freq: pitchFor(z), pan, gain: accent ? 0.32 : 0.14, delayS: i * step, dur: accent ? 0.45 : step * 1.6, type: "triangle" });
    }
  });

  // setInterval instead of requestAnimationFrame: rAF pauses in background tabs and the
  // sweep line used to get stuck on the map. The timeout below always cleans up.
  clearInterval(sweepTimer); clearTimeout(sweepCleanup);
  const start = performance.now();
  const head = $("playhead");
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / 1000 / SWEEP_SECONDS);
    const idx = Math.min(SWEEP_SAMPLES - 1, Math.floor(t * SWEEP_SAMPLES));
    headGraphic.geometry = new Point({ x: pts[idx].x, y: pts[idx].y, spatialReference: view.spatialReference });
    head?.setAttribute("x1", 6 + t * 588); head?.setAttribute("x2", 6 + t * 588);
    if (t >= 1) clearInterval(sweepTimer);
  };
  tick();
  sweepTimer = setInterval(tick, 33);
  sweepCleanup = setTimeout(() => {
    clearInterval(sweepTimer);
    view.graphics.removeMany([sweepGraphic, headGraphic]);
    setStatus("Sweep complete.");
  }, SWEEP_SECONDS * 1000 + 600);

  announce(`Profile across the view, west to east. ${summary}`);
}

function drawProfile(zs, hi, lo) {
  const W = 600, H = 120, pad = 6;
  const finite = zs.filter(Number.isFinite);
  const max = Math.max(100, ...finite), min = Math.min(0, ...finite);
  const x = i => pad + (i / (zs.length - 1)) * (W - pad * 2);
  const y = z => H - pad - ((clamp(Number.isFinite(z) ? z : 0, min, max) - min) / (max - min || 1)) * (H - pad * 2);
  const line = zs.map((z, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(z).toFixed(1)}`).join(" ");
  const sea = y(0);
  ui.profile.innerHTML = `
    <rect x="0" y="${sea.toFixed(1)}" width="${W}" height="${(H - sea).toFixed(1)}" class="p-sea"/>
    <path d="${line} L${x(zs.length - 1)} ${H} L${x(0)} ${H}Z" class="p-fill"/>
    <path d="${line}" class="p-line"/>
    ${hi ? `<circle cx="${x(hi.i)}" cy="${y(hi.e)}" r="4" class="p-hi"/><text x="${clamp(x(hi.i), 40, W - 40)}" y="14" class="p-lbl" text-anchor="middle">${fmtM(hi.e)}</text>` : ""}
    <line id="playhead" x1="${pad}" x2="${pad}" y1="0" y2="${H}" class="p-head"/>`;
}

// earthquake sonar
const ringGraphic = new Graphic({ symbol: { type: "simple-fill", color: [255, 92, 160, 0.08], outline: { color: [255, 92, 160, 0.9], width: 1.5 } } });
let highlight = null, ringTimer = 0;
const MAX_PINGS = 30; // play the nearest quakes only, so the echo stays readable

function sonarRadiusKm() {
  const l = view.toMap({ x: 0, y: view.height / 2 }), r = view.toMap({ x: view.width, y: view.height / 2 });
  return clamp(haversineKm(l.latitude, l.longitude, r.latitude, r.longitude) / 4, 10, 1500);
}

async function quakeSonar(at) {
  const center = at ?? state.listenPoint ?? view.center;
  if (!state.quakeView || !audio.ready) return;
  const radiusKm = sonarRadiusKm();

  ringGraphic.geometry = new Circle({ center, radius: radiusKm, radiusUnit: "kilometers", geodesic: true });
  view.graphics.add(ringGraphic);
  clearTimeout(ringTimer);
  ringTimer = setTimeout(() => view.graphics.remove(ringGraphic), 1800);

  let feats = [];
  try {
    const fs = await state.quakeView.queryFeatures({
      geometry: center, distance: radiusKm, units: "kilometers",
      outFields: ["mag", "place", "depth"], returnGeometry: true
    });
    feats = fs.features;
  } catch (err) { console.warn(err); }

  const lat = center.latitude, lon = center.longitude;
  const all = feats.map(f => {
    const g = f.geometry, a = f.attributes;
    const distanceKm = haversineKm(lat, lon, g.latitude, g.longitude);
    return { f, distanceKm, bearing: bearingDeg(lat, lon, g.latitude, g.longitude), mag: a.mag, depthKm: a.depth, place: a.place };
  }).sort((a, b) => a.distanceKm - b.distanceKm);
  const qs = all.slice(0, MAX_PINGS);

  audio.sonarSend();
  qs.forEach(q => {
    const p = quakeToPing(q, radiusKm);
    audio.ping({ freq: p.freq, pan: p.pan, gain: p.gain, delayS: 0.15 + p.delayMs / 1000 });
  });

  highlight?.remove();
  if (qs.length) highlight = state.quakeView.highlight(qs.map(q => q.f));

  const r = Math.round(radiusKm).toLocaleString("en-US");
  if (!qs.length) {
    ui.quake.textContent = `none within ${r} km`;
    announce(`Sonar: no earthquakes in the past 30 days within ${r} kilometers.`);
    return;
  }
  const big = all.reduce((a, b) => ((b.mag ?? 0) > (a.mag ?? 0) ? b : a));
  const n = all.length.toLocaleString("en-US");
  const played = all.length > MAX_PINGS ? ` Playing the nearest ${MAX_PINGS}.` : "";
  ui.quake.textContent = `${n} within ${r} km · strongest M${big.mag?.toFixed(1)}`;
  announce(`Sonar: ${n} earthquake${all.length > 1 ? "s" : ""} within ${r} kilometers.${played} ` +
    `Strongest magnitude ${big.mag?.toFixed(1)}, ${Math.round(big.distanceKm)} kilometers ${compassWord(big.bearing)}, ` +
    `${Math.round(big.depthKm ?? 0)} kilometers deep${big.place ? `, ${big.place}` : ""}.`);
}

// spoken summary of the listening point
async function speakHere() {
  const p = state.listenPoint ?? view.center;
  let z = await elevationAt(p);
  if (z === undefined) { // a hover query was in flight; ask directly
    try { z = (await elevation.queryElevation(p, { noDataValue: NO_DATA })).geometry.z; if (z === NO_DATA) z = NaN; }
    catch { z = NaN; }
  }
  const where = `${Math.abs(p.latitude).toFixed(2)} degrees ${p.latitude >= 0 ? "north" : "south"}, ${Math.abs(p.longitude).toFixed(2)} degrees ${p.longitude >= 0 ? "east" : "west"}`;
  announce(`${where}. ${isWater(z) ? "Water or sea level." : `Elevation ${fmtM(z)}.`}`);
}

// controls
const startDlg = $("startDlg");
async function ensureAudio() {
  if (audio.ready) return;
  await audio.start();
  $("app").classList.add("listening");
  setStatus("Listening. Move over the map.");
  announce("Listening. Move the pointer, or use the arrow keys to pan. Press Space for a profile sweep, Q for earthquake sonar, S to hear where you are, H for help.");
}
$("startBtn").addEventListener("click", async () => {
  await ensureAudio();
  startDlg.close();
  view.focus();
});

const actions = {
  sweep, sonar: () => quakeSonar(), speak: speakHere,
  mute: () => { audio.setMuted(!audio.muted); $("muteBtn").setAttribute("aria-pressed", audio.muted); announce(audio.muted ? "Muted." : "Sound on."); },
  musical: () => { state.musical = !state.musical; $("musicBtn").setAttribute("aria-pressed", state.musical); announce(state.musical ? "Musical scale on." : "Continuous pitch."); },
  voice: () => { state.speak = !state.speak; $("voiceBtn").setAttribute("aria-pressed", state.speak); announce(state.speak ? "Voice on." : "Voice off."); },
  help: () => $("helpDlg").showModal(),
  about: () => $("aboutDlg").showModal()
};
const NEEDS_AUDIO = action => action !== "help" && action !== "about";
document.querySelectorAll("[data-action]").forEach(b => b.addEventListener("click", async () => {
  if (NEEDS_AUDIO(b.dataset.action)) await ensureAudio();
  actions[b.dataset.action]();
}));

const KEYS = { " ": "sweep", p: "sweep", q: "sonar", s: "speak", m: "mute", l: "musical", v: "voice", h: "help", "?": "help", a: "about" };
window.addEventListener("keydown", async e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, dialog[open]")) return;
  if (e.target.closest?.("button") && (e.key === " " || e.key === "Enter")) return; // let buttons click natively
  const act = KEYS[e.key.toLowerCase()];
  if (!act) return;
  e.preventDefault();
  if (NEEDS_AUDIO(act)) await ensureAudio();
  actions[act]();
});

$("placeSel").addEventListener("change", async e => {
  const p = PLACES[e.target.value];
  await view.goTo({ center: p.center, zoom: p.zoom }, { duration: 1500 });
  state.lastInput = "keyboard";
  announce(`Moved to ${p.label}.`);
});
$("placeSel").innerHTML = Object.entries(PLACES).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join("");

// debug handle
// Open the app with ?debug to inspect the view and state from the browser console.
if (new URLSearchParams(location.search).has("debug")) window.hearTheMap = { view, state, quakes, elevation, audio };

// boot
view.when(async () => {
  refreshSampler();
  state.quakeView = await view.whenLayerView(quakes);
  await reactiveUtils.whenOnce(() => !state.quakeView.updating);
  setStatus(audio.ready ? "Listening. Move over the map." : "Ready. Press Start listening.");
}).catch(err => { console.error(err); setStatus("The map failed to load. Check your connection."); });

drawProfile(Array(SWEEP_SAMPLES).fill(0), null, null);
startDlg.showModal();
