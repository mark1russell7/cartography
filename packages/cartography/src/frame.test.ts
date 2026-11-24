import { geodesicDirect, geodesicInverse, type LatLon } from "@mark1russell7/geo";
import { azimuthalEquidistant, WEB_MERCATOR } from "@mark1russell7/geo/projection";
import { mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import { frameAround, frameBBox, frameView, niceScale, type Frame } from "./frame.ts";

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

describe("niceScale", () => {
  it("rounds a scale up to a round value", () => {
    expect(niceScale(18_300)).toBe(20_000);
    expect(niceScale(1_310_000)).toBe(1_500_000);
    expect(niceScale(7_600)).toBe(10_000);
    expect(niceScale(25_000)).toBe(25_000);
    expect(niceScale(0.3)).toBeCloseTo(0.3, 12);
  });

  it("refuses a scale that is not a finite number more than 0", () => {
    expect(() => niceScale(0)).toThrow(MapError);
    expect(() => niceScale(Number.NaN)).toThrow(MapError);
  });
});

describe("frameAround", () => {
  // Made-up points: two ends of a line of approximately 100 km, east to west.
  const west: LatLon = { lat: 10, lon: 10 };
  const east: LatLon = { lat: 10, lon: 10.913 };

  it("gives a frame that shows each point inside the margin", () => {
    const frame = frameAround([west, east], { projection: azimuthalEquidistant, widthMm: 180, heightMm: 120, marginMm: 10 });
    expect(frame.center.lon).toBeCloseTo(10.4565, 6);
    const view = frameView(frame);
    for (const point of [west, east]) {
      const paper = view.toPaper(point);
      expect(paper.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(paper.x).toBeLessThanOrEqual(170 + 1e-9);
    }
    expect(frame.scale).toBe(niceScale(frame.scale));
  });

  it("puts the points on the margin with no rounding", () => {
    const frame = frameAround([west, east], { projection: azimuthalEquidistant, widthMm: 180, heightMm: 120, marginMm: 10, roundScale: false });
    const view = frameView(frame);
    expect(view.toPaper(west).x).toBeCloseTo(10, 6);
    expect(view.toPaper(east).x).toBeCloseTo(170, 6);
    const ground = geodesicInverse(west, east).meters;
    expect(ground / (160 / 1000)).toBeCloseTo(frame.scale, -2);
  });

  it("uses the height when the points go north and south", () => {
    const north: LatLon = { lat: 10.9, lon: 10 };
    const frame = frameAround([west, north], { projection: azimuthalEquidistant, widthMm: 200, heightMm: 100, roundScale: false });
    const view = frameView(frame);
    expect(Math.min(view.toPaper(north).y, 100 - view.toPaper(west).y)).toBeCloseTo(0, 6);
    expect(view.toPaper(west).y).toBeCloseTo(100, 2);
  });

  it("keeps a given center, with the same space on the two sides", () => {
    const frame = frameAround([west, east], { projection: azimuthalEquidistant, widthMm: 100, heightMm: 100, center: west, roundScale: false });
    expect(frame.center).toEqual(west);
    expect(frameView(frame).toPaper(east).x).toBeCloseTo(100, 6);
  });

  it("accepts a projection that does not depend on the center", () => {
    const frame = frameAround([west, east], { projection: () => WEB_MERCATOR, widthMm: 100, heightMm: 100 });
    expect(frame.projection).toBe(WEB_MERCATOR);
  });

  it("refuses no point, a bad margin, a bad size and points with no extent", () => {
    const options = { projection: azimuthalEquidistant, widthMm: 100, heightMm: 100 };
    expect(() => frameAround([], options)).toThrow(/no point/);
    expect(() => frameAround([west, east], { ...options, marginMm: 50 })).toThrow(/no space/);
    expect(() => frameAround([west, east], { ...options, marginMm: -1 })).toThrow(/margin/);
    expect(() => frameAround([west, east], { ...options, widthMm: 0 })).toThrow(MapError);
    expect(() => frameAround([west, west], options)).toThrow(/at the center/);
  });

  describe("with no height", () => {
    // A made-up box of approximately 8 km by 4.4 km. It is not the place of a person.
    const box = { south: 44.98, west: 9.95, north: 45.02, east: 10.05 };
    const middle = (box.west + box.east) / 2;
    const samples: LatLon[] = [
      { lat: box.south, lon: box.west },
      { lat: box.south, lon: box.east },
      { lat: box.north, lon: box.west },
      { lat: box.north, lon: box.east },
      { lat: box.north, lon: middle },
      { lat: box.south, lon: middle },
    ];

    it("fits the width exactly: the extreme points are on the left and right edges", () => {
      const frame = frameAround(samples, { projection: azimuthalEquidistant, widthMm: 180, roundScale: false });
      expect(frame.widthMm).toBe(180);
      const xs = samples.map((point) => frameView(frame).toPaper(point).x);
      expect(Math.min(...xs)).toBeCloseTo(0, 6);
      expect(Math.max(...xs)).toBeCloseTo(180, 6);
    });

    it("gives the height from the extent of the points in y, rounded up to a whole millimetre", () => {
      const frame = frameAround(samples, { projection: azimuthalEquidistant, widthMm: 180, roundScale: false });
      const view = frameView(frame);
      const ys = samples.map((point) => view.toPaper(point).y);
      const middleY = frame.heightMm / 2;
      const reach = Math.max(...ys.map((y) => Math.abs(y - middleY)));
      expect(Number.isInteger(frame.heightMm)).toBe(true);
      expect(frame.heightMm).toBeGreaterThanOrEqual(2 * reach - 1e-6);
      expect(frame.heightMm).toBeLessThan(2 * reach + 1);
      // The box is approximately 4.45 km by 7.88 km, so the height is approximately 180 * 4.45 / 7.88 mm.
      expect(frame.heightMm).toBeGreaterThan(95);
      expect(frame.heightMm).toBeLessThan(110);
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(frame.heightMm + 1e-6);
      }
    });

    it("adds the margins to the height, and keeps each point inside the margin with a round scale", () => {
      const frame = frameAround(samples, { projection: azimuthalEquidistant, widthMm: 180, marginMm: 10 });
      expect(frame.scale).toBe(niceScale(frame.scale));
      const view = frameView(frame);
      for (const point of samples) {
        const paper = view.toPaper(point);
        expect(paper.x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(paper.x).toBeLessThanOrEqual(170 + 1e-6);
        expect(paper.y).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(paper.y).toBeLessThanOrEqual(frame.heightMm - 10 + 1e-6);
      }
    });

    it("fits seeded boxes into seeded widths", () => {
      const random = mulberry32(seedOf("cartography frame around with no height"));
      for (let round = 0; round < 50; round += 1) {
        const south = -60 + random() * 110;
        const west = -170 + random() * 330;
        const north = south + 0.01 + random() * 2;
        const east = west + 0.01 + random() * 2;
        const center = (west + east) / 2;
        const points: LatLon[] = [
          { lat: south, lon: west },
          { lat: south, lon: east },
          { lat: north, lon: west },
          { lat: north, lon: east },
          { lat: north, lon: center },
          { lat: south, lon: center },
        ];
        const width = 50 + random() * 400;
        const frame = frameAround(points, { projection: azimuthalEquidistant, widthMm: width, roundScale: false });
        const view = frameView(frame);
        const paper = points.map((point) => view.toPaper(point));
        expect(Math.min(...paper.map((p) => p.x)), `round ${round}`).toBeCloseTo(0, 6);
        expect(Math.max(...paper.map((p) => p.x)), `round ${round}`).toBeCloseTo(width, 6);
        for (const p of paper) {
          expect(p.y, `round ${round}`).toBeGreaterThanOrEqual(-1e-6);
          expect(p.y, `round ${round}`).toBeLessThanOrEqual(frame.heightMm + 1e-6);
        }
      }
    });

    it("refuses points on one vertical line, and a frame with no height", () => {
      const north: LatLon = { lat: 10.9, lon: 10 };
      expect(() => frameAround([west, north], { projection: azimuthalEquidistant, widthMm: 100 })).toThrow(/vertical line/);
      // On Web Mercator, two points of one latitude have the same y, so the frame has no height.
      expect(() => frameAround([west, east], { projection: () => WEB_MERCATOR, widthMm: 100, roundScale: false })).toThrow(/height/);
    });
  });
});
