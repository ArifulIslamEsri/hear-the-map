// data -> sound parameters. No DOM / Web Audio / SDK imports so it's easy to test.

export const SEA_LEVEL_EPSILON = 0.5; // metres; at or below this we play "water"
export const MAX_LAND_M = 6000;       // elevations above this map to the top note
export const LOW_HZ = 110;            // A2
export const OCTAVES = 4;             // A2 .. A6

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PENTATONIC = [0, 2, 4, 7, 9]; // major pentatonic, semitones within an octave

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** True when the elevation should sound like water / below sea level. */
export function isWater(elevationM) {
  return !Number.isFinite(elevationM) || elevationM <= SEA_LEVEL_EPSILON;
}

/**
 * Elevation (m) -> frequency (Hz).
 * Square-root scaling gives lowlands more pitch resolution than peaks,
 * so a 200 m river valley is still audible next to a 50 m floodplain.
 */
export function elevationToFrequency(elevationM) {
  const t = Math.sqrt(clamp(elevationM, 0, MAX_LAND_M) / MAX_LAND_M);
  return LOW_HZ * Math.pow(2, OCTAVES * t);
}

/** Snap a frequency to the nearest note of the major pentatonic scale on A. */
export function quantizePentatonic(freq) {
  const semis = 12 * Math.log2(freq / LOW_HZ);
  const octave = Math.floor(semis / 12);
  const within = semis - octave * 12;
  let best = PENTATONIC[0], bestD = Infinity;
  for (const s of [...PENTATONIC, 12]) {
    const d = Math.abs(within - s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return LOW_HZ * Math.pow(2, (octave * 12 + best) / 12);
}

/** Frequency -> note name such as "A4". */
export function frequencyToNote(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Screen x (px) inside a view of width w -> stereo pan in [-1, 1]. */
export function screenXToPan(x, width) {
  if (!width) return 0;
  return clamp((x / width) * 2 - 1, -1, 1);
}

const toRad = d => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing in degrees (0 = north, 90 = east). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Eight-point compass word for a bearing. */
export function compassWord(deg) {
  const words = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return words[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/**
 * One earthquake -> one sonar "ping".
 * - delay: closer quakes answer first, like an echo (0 .. maxDelayMs)
 * - pan:   east is right, west is left
 * - gain:  bigger magnitude is louder (each magnitude step is about +6 dB)
 * - freq:  shallow quakes are bright, deep quakes are dark
 */
export function quakeToPing({ distanceKm, bearing, mag, depthKm }, radiusKm, maxDelayMs = 900) {
  const delayMs = clamp(distanceKm / radiusKm, 0, 1) * maxDelayMs;
  const pan = clamp(Math.sin(toRad(bearing)), -1, 1);
  const gain = clamp(0.06 * Math.pow(2, clamp(mag ?? 0, 0, 9) - 2), 0.03, 0.9);
  const depth = clamp(depthKm ?? 10, 0, 700);
  const freq = 1600 * Math.pow(2, -3 * Math.sqrt(depth / 700)); // 1600 Hz shallow .. 200 Hz at 700 km
  return { delayMs, pan, gain, freq };
}

/**
 * Elevations sampled left->right across the view.
 * Returns the highest and lowest samples and a short summary sentence.
 */
export function describeProfile(elevations) {
  const valid = elevations.map((e, i) => ({ e, i })).filter(d => Number.isFinite(d.e));
  if (!valid.length) return { summary: "No elevation data across this view.", hi: null, lo: null };
  const hi = valid.reduce((a, b) => (b.e > a.e ? b : a));
  const lo = valid.reduce((a, b) => (b.e < a.e ? b : a));
  const where = i => {
    const t = i / Math.max(1, elevations.length - 1);
    return t < 0.2 ? "the left edge" : t > 0.8 ? "the right edge" : t < 0.4 ? "left of center" : t > 0.6 ? "right of center" : "the center";
  };
  const water = elevations.filter(isWater).length;
  const waterPart = water ? ` ${Math.round((100 * water) / elevations.length)}% of the line is at or below sea level.` : "";
  return {
    hi, lo,
    summary: `Highest ${fmtHeight(hi.e)} near ${where(hi.i)}. Lowest ${fmtHeight(lo.e)} near ${where(lo.i)}.${waterPart}`
  };
}

/** Height for spoken summaries: "86 m below sea level" instead of "-86 m". */
export function fmtHeight(m) {
  return Number.isFinite(m) && m < 0 ? `${fmtM(-m)} below sea level` : fmtM(m);
}

export function fmtM(m) {
  if (!Number.isFinite(m)) return "no data";
  return `${Math.round(m).toLocaleString("en-US")} m`;
}
