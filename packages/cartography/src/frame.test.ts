import { geodesicDirect, geodesicInverse, type LatLon } from "@mark1russell7/geo";
import { azimuthalEquidistant, WEB_MERCATOR } from "@mark1russell7/geo/projection";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import { frameBBox, frameView, type Frame } from "./frame.ts";

// A made-up center. It is not the place of a person.
const CENTER: LatLon = { lat: 45, lon: 10 };

function frame(projection: Frame["projection"], center: LatLon = CENTER): Frame {
  return { projection, center, scale: 24000, widthMm: 180, heightMm: 240 };
}

describe("frameView", () => {
  // Web Mercator is not conformal on the ellipsoid: at 45 degrees its scale changes with the direction by approximately 0.34 %.
  for (const [name, projection, relative] of [
    ["azimuthal equidistant", azimuthalEquidistant(CENTER), 1e-6],
    ["Web Mercator", WEB_MERCATOR, 0.002],
  ] as const) {
    describe(name, () => {
      const view = frameView(frame(projection));

      it("puts the center at the middle of the paper", () => {
        const middle = view.toPaper(CENTER);
        expect(middle.x).toBeCloseTo(90, 9);
        expect(middle.y).toBeCloseTo(120, 9);
      });

      it("gives the true scale at the center: 1 km on the ground is 1e6 / 24000 mm on the paper", () => {
        for (const bearing of [0, 90, 180, 270]) {
          const point = view.toPaper(geodesicDirect(CENTER, bearing, 1000).point);
          const length = Math.hypot(point.x - 90, point.y - 120);
          expect(Math.abs(length / (1e6 / 24000) - 1)).toBeLessThan(relative);
        }
      });

      it("puts north at the top of the paper at the center", () => {
        expect(view.northDegrees).toBeCloseTo(0, 6);
        const north = view.toPaper(geodesicDirect(CENTER, 0, 1000).point);
        expect(north.y).toBeLessThan(120);
      });

      it("gives the point on the Earth for a point on the paper", () => {
        for (const paper of [
          { x: 0, y: 0 },
          { x: 180, y: 240 },
          { x: 33.3, y: 201.7 },
        ]) {
          const back = view.toPaper(view.fromPaper(paper));
          expect(back.x).toBeCloseTo(paper.x, 6);
          expect(back.y).toBeCloseTo(paper.y, 6);
        }
      });
    });
  }

  it("refuses a scale or a size that is not a finite number more than 0", () => {
    for (const bad of [{ scale: 0 }, { widthMm: -1 }, { heightMm: Number.NaN }, { scale: Number.POSITIVE_INFINITY }]) {
      expect(() => frameView({ ...frame(WEB_MERCATOR), ...bad })).toThrow(MapError);
    }
  });
});

describe("frameBBox", () => {
  it("contains each corner of the frame, and is not much larger than the frame", () => {
    const f = frame(azimuthalEquidistant(CENTER));
    const view = frameView(f);
    const box = frameBBox(f);
    for (const paper of [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 0, y: 240 },
      { x: 180, y: 240 },
    ]) {
      const corner = view.fromPaper(paper);
      expect(corner.lat).toBeGreaterThanOrEqual(box.south - 1e-12);
      expect(corner.lat).toBeLessThanOrEqual(box.north + 1e-12);
      expect(corner.lon).toBeGreaterThanOrEqual(box.west - 1e-12);
      expect(corner.lon).toBeLessThanOrEqual(box.east + 1e-12);
    }
    // The height of the frame on the ground is 240 mm * 24000 = 5.76 km.
    const height = geodesicInverse({ lat: box.south, lon: CENTER.lon }, { lat: box.north, lon: CENTER.lon }).meters;
    expect(height).toBeGreaterThan(5760 - 1);
    expect(height).toBeLessThan(5760 * 1.01);
  });
});
