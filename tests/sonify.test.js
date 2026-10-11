import { describe, it, expect } from "vitest";
import {
  isWater, elevationToFrequency, quantizePentatonic, frequencyToNote, screenXToPan,
  haversineKm, bearingDeg, compassWord, quakeToPing, describeProfile, LOW_HZ, OCTAVES
} from "../src/sonify.js";

describe("elevation to pitch", () => {
  it("maps sea level to the lowest note and 6000 m to the top note", () => {
    expect(elevationToFrequency(0)).toBeCloseTo(LOW_HZ);
    expect(elevationToFrequency(6000)).toBeCloseTo(LOW_HZ * 2 ** OCTAVES);
    expect(elevationToFrequency(8848)).toBeCloseTo(LOW_HZ * 2 ** OCTAVES); // clamped
  });
  it("always rises with elevation", () => {
    let prev = 0;
    for (let m = 0; m <= 6000; m += 50) {
      const f = elevationToFrequency(m);
      expect(f).toBeGreaterThan(prev - 1e-9);
      prev = f;
    }
  });
  it("gives lowlands more pitch room than peaks", () => {
    const low = elevationToFrequency(500) - elevationToFrequency(0);
    const high = elevationToFrequency(6000) - elevationToFrequency(5500);
    const lowSemis = 12 * Math.log2(elevationToFrequency(500) / elevationToFrequency(0));
    const highSemis = 12 * Math.log2(elevationToFrequency(6000) / elevationToFrequency(5500));
    expect(lowSemis).toBeGreaterThan(highSemis);
    expect(low).toBeGreaterThan(0); expect(high).toBeGreaterThan(0);
  });
});

describe("water", () => {
  it("treats sea level, below sea level and no-data as water", () => {
    expect(isWater(0)).toBe(true);
    expect(isWater(-86)).toBe(true); // Death Valley
    expect(isWater(NaN)).toBe(true);
    expect(isWater(12)).toBe(false);
  });
});

describe("notes", () => {
  it("names concert A", () => {
    expect(frequencyToNote(440)).toBe("A4");
    expect(frequencyToNote(110)).toBe("A2");
    expect(frequencyToNote(261.63)).toBe("C4");
  });
  it("snaps to the A major pentatonic scale", () => {
    const allowed = new Set(["A", "B", "C#", "E", "F#"]);
    for (let f = 110; f < 1760; f *= 1.037) {
      const n = frequencyToNote(quantizePentatonic(f)).replace(/\d+$/, "");
      expect(allowed.has(n)).toBe(true);
    }
  });
});

describe("space", () => {
  it("pans from left to right across the view", () => {
    expect(screenXToPan(0, 800)).toBe(-1);
    expect(screenXToPan(400, 800)).toBe(0);
    expect(screenXToPan(800, 800)).toBe(1);
    expect(screenXToPan(900, 800)).toBe(1);
  });
  it("measures real distances", () => {
    // Dhaka to Bowling Green, Ohio: about 12,742 km
    expect(haversineKm(23.8103, 90.4125, 41.3748, -83.6513)).toBeGreaterThan(12600);
    expect(haversineKm(23.8103, 90.4125, 41.3748, -83.6513)).toBeLessThan(12850);
  });
  it("finds compass directions", () => {
    expect(compassWord(bearingDeg(0, 0, 0, 1))).toBe("east");
    expect(compassWord(bearingDeg(0, 0, 1, 0))).toBe("north");
    expect(compassWord(bearingDeg(0, 0, -1, -1))).toBe("southwest");
  });
});

describe("earthquake sonar", () => {
  const R = 100;
  it("echoes closer quakes first", () => {
    const near = quakeToPing({ distanceKm: 10, bearing: 90, mag: 3, depthKm: 10 }, R);
    const far = quakeToPing({ distanceKm: 90, bearing: 90, mag: 3, depthKm: 10 }, R);
    expect(near.delayMs).toBeLessThan(far.delayMs);
  });
  it("puts east on the right and west on the left", () => {
    expect(quakeToPing({ distanceKm: 5, bearing: 90, mag: 3 }, R).pan).toBeCloseTo(1);
    expect(quakeToPing({ distanceKm: 5, bearing: 270, mag: 3 }, R).pan).toBeCloseTo(-1);
  });
  it("is louder for stronger and brighter for shallower quakes", () => {
    const a = quakeToPing({ distanceKm: 5, bearing: 0, mag: 2, depthKm: 10 }, R);
    const b = quakeToPing({ distanceKm: 5, bearing: 0, mag: 5, depthKm: 10 }, R);
    const deep = quakeToPing({ distanceKm: 5, bearing: 0, mag: 5, depthKm: 400 }, R);
    expect(b.gain).toBeGreaterThan(a.gain);
    expect(b.freq).toBeGreaterThan(deep.freq);
  });
});

describe("profile summary", () => {
  it("finds the highest and lowest points and water share", () => {
    const zs = [0, 0, 50, 300, 1200, 4000, 2500, 900];
    const d = describeProfile(zs);
    expect(d.hi.i).toBe(5);
    expect(d.summary).toMatch(/Highest 4,000 m/);
    expect(d.summary).toMatch(/25% of the line is at or below sea level/);
  });
});
