import { geodesicDirect, type LatLon } from "@mark1russell7/geo";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";
import { describe, expect, it } from "vitest";
import { ATLAS_OVERLAP_MM, atlasIndexFrame, atlasOutlines, atlasPages, columnName, type AtlasPlan } from "./atlas.ts";
import { MapError } from "./errors.ts";
import { frameView, type PaperPoint } from "./frame.ts";

// A made-up center. It is not the place of a person.
const CENTER: LatLon = { lat: 45, lon: 10 };
const PLAN: AtlasPlan = { projection: azimuthalEquidistant(CENTER), center: CENTER, radiusMeters: 25_000, scale: 63_360, widthMm: 190, heightMm: 230 };
const inside = (point: PaperPoint, widthMm: number, heightMm: number, margin = 0): boolean =>
  point.x >= -margin && point.x <= widthMm + margin && point.y >= -margin && point.y <= heightMm + margin;
/** This function gives the distance on the paper from a point to the rectangle of a page, in millimetres. */
const toRectangle = (point: PaperPoint, widthMm: number, heightMm: number): number =>
  Math.hypot(Math.max(-point.x, 0, point.x - widthMm), Math.max(-point.y, 0, point.y - heightMm));

describe("columnName", () => {
  it("gives A to Z, then AA, AB and the next names", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("refuses an index that is not an integer of 0 or more", () => {
    for (const index of [-1, 1.5, Number.NaN]) expect(() => columnName(index)).toThrow(MapError);
  });
});

describe("atlasPages", () => {
  const atlas = atlasPages(PLAN);
  const radiusMm = PLAN.radiusMeters * (1000 / PLAN.scale);

  it("gives the smallest grid that shows the circle, with its middle at the center", () => {
    // 50 km at 1:63,360 is 789 mm. Steps of 180 mm and 220 mm need 5 columns and 4 rows.
    expect(atlas).toMatchObject({ columns: 5, rows: 4 });
    const xs = atlas.pages.map((page) => frameView(page.frame).toPaper(CENTER).x);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(PLAN.widthMm, 6);
  });

  it("keeps each page that shows a part of the circle, and only those pages", () => {
    for (const page of atlas.pages) expect(toRectangle(frameView(page.frame).toPaper(CENTER), PLAN.widthMm, PLAN.heightMm)).toBeLessThan(radiusMm);
    expect(atlas.pages).toHaveLength(20);
    // The circle of 30 km needs a grid of 6 by 5 pages. The circle does not reach the 4 corner pages: their nearest corner is at 481 mm.
    const wide = atlasPages({ ...PLAN, radiusMeters: 30_000 });
    expect(wide).toMatchObject({ columns: 6, rows: 5 });
    expect(wide.pages).toHaveLength(26);
    for (const id of ["A1", "F1", "A5", "F5"]) expect(wide.pages.map((page) => page.id)).not.toContain(id);
    for (const page of wide.pages) expect(toRectangle(frameView(page.frame).toPaper(CENTER), PLAN.widthMm, PLAN.heightMm)).toBeLessThan(30_000 * (1000 / PLAN.scale));
    expect(wide.pages.find((page) => page.id === "B1")?.neighbors).toEqual({ right: "C1", bottom: "B2" });
  });

  it("shows each point of the circle on a page, for a seeded draw of points", () => {
    let state = 2024;
    const next = (): number => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    const views = atlas.pages.map((page) => frameView(page.frame));
    for (let i = 0; i < 400; i += 1) {
      const point = geodesicDirect(CENTER, 360 * next(), PLAN.radiusMeters * Math.sqrt(next())).point;
      expect(views.some((view) => inside(view.toPaper(point), PLAN.widthMm, PLAN.heightMm)), `point ${i}`).toBe(true);
    }
  });

  it("names the neighbor pages, in both directions", () => {
    const byId = new Map(atlas.pages.map((page) => [page.id, page]));
    expect(byId.get("C2")?.neighbors).toEqual({ top: "C1", right: "D2", bottom: "C3", left: "B2" });
    for (const page of atlas.pages) {
      for (const [edge, back] of [["top", "bottom"], ["right", "left"], ["bottom", "top"], ["left", "right"]] as const) {
        const id = page.neighbors[edge];
        if (id !== undefined) expect(byId.get(id)?.neighbors[back]).toBe(page.id);
      }
    }
  });

  it("gives neighbor pages a shared strip of the overlap, and their edges agree to 0.01 mm", () => {
    const byId = new Map(atlas.pages.map((page) => [page.id, page]));
    for (const page of atlas.pages) {
      const view = frameView(page.frame);
      const east = page.neighbors.right === undefined ? undefined : byId.get(page.neighbors.right);
      if (east !== undefined) {
        const point = view.fromPaper({ x: PLAN.widthMm - ATLAS_OVERLAP_MM / 2, y: 40 });
        const there = frameView(east.frame).toPaper(point);
        expect(there.x).toBeCloseTo(ATLAS_OVERLAP_MM / 2, 2);
        expect(there.y).toBeCloseTo(40, 2);
      }
      const south = page.neighbors.bottom === undefined ? undefined : byId.get(page.neighbors.bottom);
      if (south !== undefined) {
        const point = view.fromPaper({ x: 20, y: PLAN.heightMm - ATLAS_OVERLAP_MM / 2 });
        const there = frameView(south.frame).toPaper(point);
        expect(there.x).toBeCloseTo(20, 2);
        expect(there.y).toBeCloseTo(ATLAS_OVERLAP_MM / 2, 2);
      }
    }
  });

  it("gives one page with no neighbors for a small area", () => {
    const one = atlasPages({ ...PLAN, radiusMeters: 1000, overlapMm: 0 });
    expect(one).toMatchObject({ columns: 1, rows: 1 });
    expect(one.pages).toHaveLength(1);
    expect(one.pages[0]).toMatchObject({ id: "A1", column: 0, row: 0, neighbors: {} });
    expect(one.pages[0]!.frame.center.lat).toBeCloseTo(CENTER.lat, 9);
    expect(one.pages[0]!.frame.center.lon).toBeCloseTo(CENTER.lon, 9);
  });

  it("refuses a radius, an overlap or a frame that is not correct", () => {
    const code = (plan: AtlasPlan): string | undefined => {
      try {
        atlasPages(plan);
        return undefined;
      } catch (error) {
        return error instanceof MapError ? error.code : "other";
      }
    };
    expect(code({ ...PLAN, radiusMeters: 0 })).toBe("atlas");
    expect(code({ ...PLAN, radiusMeters: Number.POSITIVE_INFINITY })).toBe("atlas");
    expect(code({ ...PLAN, overlapMm: -1 })).toBe("atlas");
    expect(code({ ...PLAN, overlapMm: 95 })).toBe("atlas");
    expect(code({ ...PLAN, scale: 0 })).toBe("frame");
  });
});

describe("atlasOutlines", () => {
  const atlas = atlasPages(PLAN);

  it("gives a closed counterclockwise polygon for each page, with the name of the page", () => {
    const outlines = atlasOutlines(atlas, 4);
    expect(outlines).toHaveLength(atlas.pages.length);
    outlines.forEach((outline, index) => {
      const page = atlas.pages[index]!;
      expect(outline.properties).toEqual({ id: page.id });
      if (outline.geometry?.type !== "Polygon") throw new Error("not a polygon");
      const ring = outline.geometry.coordinates[0]!;
      expect(ring).toHaveLength(4 * 4 + 1);
      expect(ring.at(-1)).toEqual(ring[0]);
      let twice = 0;
      for (let i = 1; i < ring.length; i += 1) twice += ring[i - 1]![0] * ring[i]![1] - ring[i]![0] * ring[i - 1]![1];
      expect(twice).toBeGreaterThan(0);
      const view = frameView(page.frame);
      for (const position of ring) expect(toRectangle(view.toPaper({ lon: position[0], lat: position[1] }), PLAN.widthMm, PLAN.heightMm)).toBeLessThan(1e-6);
    });
  });

  it("refuses a number of points that is not an integer of 1 or more", () => {
    expect(() => atlasOutlines(atlas, 0)).toThrow(MapError);
  });
});

describe("atlasIndexFrame", () => {
  it("shows all the pages of the grid, and the grid touches two edges of the space", () => {
    const atlas = atlasPages(PLAN);
    const index = atlasIndexFrame(atlas, 190, 120);
    const view = frameView(index);
    const corners = atlas.pages.flatMap((page) => {
      const pageView = frameView(page.frame);
      return [
        { x: 0, y: 0 },
        { x: PLAN.widthMm, y: 0 },
        { x: PLAN.widthMm, y: PLAN.heightMm },
        { x: 0, y: PLAN.heightMm },
      ].map((corner) => view.toPaper(pageView.fromPaper(corner)));
    });
    // Each page has the scale at its own center, so a corner can differ from the grid by a small part of a micrometre.
    for (const corner of corners) expect(inside(corner, 190, 120, 0.001)).toBe(true);
    const top = Math.min(...corners.map((corner) => corner.y));
    const bottom = Math.max(...corners.map((corner) => corner.y));
    expect(top).toBeCloseTo(0, 2);
    expect(bottom).toBeCloseTo(120, 2);
  });
});
