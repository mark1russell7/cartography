import { describe, expect, it } from "vitest";
import { niceNumber, northArrowSvg, scaleBarLength, scaleBarSvg } from "./marks.ts";
import { checkStyle, grayColor, hatchPattern, mm, pointSymbol, strokeAttributes } from "./style.ts";
import { MapError } from "./errors.ts";

describe("niceNumber", () => {
  it("gives the largest 1, 2 or 5 times a power of 10 that is not more than the number", () => {
    expect(niceNumber(7.3)).toBe(5);
    expect(niceNumber(1)).toBe(1);
    expect(niceNumber(0.37)).toBe(0.2);
    expect(niceNumber(1999)).toBe(1000);
    expect(niceNumber(2000)).toBe(2000);
    expect(niceNumber(0.0049)).toBe(0.002);
  });
});

describe("scaleBarLength", () => {
  it("gives metres below 1 km, and kilometres from 1 km", () => {
    expect(scaleBarLength(1800, "metric")).toEqual({ meters: 1000, label: "1 km" });
    expect(scaleBarLength(640, "metric")).toEqual({ meters: 500, label: "500 m" });
  });

  it("gives miles from a quarter of a mile, and feet below that", () => {
    expect(scaleBarLength(2000, "imperial")).toEqual({ meters: 1609.344, label: "1 mi" });
    const feet = scaleBarLength(300, "imperial");
    expect(feet.label).toBe("500 ft");
    expect(feet.meters).toBeCloseTo(152.4, 9);
  });

  it("never gives a bar longer than the length", () => {
    for (const max of [0.7, 3, 41, 199, 402, 999, 12345, 80000]) {
      for (const units of ["metric", "imperial"] as const) {
        const length = scaleBarLength(max, units);
        expect(length.meters).toBeLessThanOrEqual(max * (1 + 1e-12));
        expect(length.meters).toBeGreaterThan(max / 5);
      }
    }
  });
});

describe("the marks", () => {
  it("draw a scale bar of four parts with its label", () => {
    const svg = scaleBarSvg(0, 0, { meters: 1000, label: "1 km" }, 1 / 24);
    expect(svg.match(/<rect /g)).toHaveLength(4);
    expect(svg).toContain(">1 km</text>");
    expect(svg).toContain(`width="${mm(1000 / 24 / 4)}"`);
  });

  it("draw a north arrow with its rotation", () => {
    expect(northArrowSvg(10, 10, -1.234)).toContain("rotate(-1.23)");
  });

  it("use black ink on white paper by default, with no fill on their texts", () => {
    const bar = scaleBarSvg(0, 0, { meters: 1000, label: "1 km" }, 1 / 24);
    const arrow = northArrowSvg(10, 10, 0);
    expect(bar.match(/fill="#000000"/g)).toHaveLength(2);
    expect(bar.match(/fill="#ffffff"/g)).toHaveLength(2);
    expect(arrow).toContain('<circle r="4.5" fill="#ffffff" stroke="#000000"');
    expect(`${bar}${arrow}`).not.toMatch(/<text[^>]*fill=/);
  });

  it("use the ink and the paper of a paint, also on their texts", () => {
    const paint = { ink: "currentColor", paper: "var(--paper)" };
    const bar = scaleBarSvg(0, 0, { meters: 1000, label: "1 km" }, 1 / 24, paint);
    const arrow = northArrowSvg(10, 10, 0, paint);
    expect(`${bar}${arrow}`).not.toMatch(/#000000|#ffffff/);
    expect(bar.match(/fill="currentColor"/g)).toHaveLength(3);
    expect(bar.split('fill="var(--paper)"')).toHaveLength(3);
    expect(arrow).toContain('<circle r="4.5" fill="var(--paper)" stroke="currentColor"');
    expect(arrow).toContain('text-anchor="middle" fill="currentColor">N</text>');
    expect(northArrowSvg(0, 0, 0, { paper: "none" })).toContain('fill="none" stroke="#000000"');
  });

  it("escape a color of a paint, and refuse a color that is empty or not a text", () => {
    expect(northArrowSvg(0, 0, 0, { ink: 'red" onload="x' })).toContain('fill="red&quot; onload=&quot;x"');
    for (const paint of [{ ink: "" }, { paper: " " }, { ink: 5 as never }]) {
      expect(() => northArrowSvg(0, 0, 0, paint)).toThrow(expect.objectContaining({ code: "style" }));
      expect(() => scaleBarSvg(0, 0, { meters: 1, label: "1 m" }, 1, paint)).toThrow(expect.objectContaining({ code: "style" }));
    }
  });
});

describe("the styles", () => {
  it("refuse a style that draws nothing or that has an incorrect value", () => {
    const bad = [
      {},
      { stroke: { widthMm: 0 } },
      { stroke: { widthMm: 0.2, gray: 2 } },
      { stroke: { widthMm: 0.2, dashMm: [1, -1] } },
      { fill: {} },
      { fill: { hatch: { angleDegrees: 45, spacingMm: 0.2, widthMm: 0.3 } } },
      { fill: { hatch: { angleDegrees: Number.NaN, spacingMm: 2, widthMm: 0.3 } } },
      { point: { symbol: "star", sizeMm: 2 } },
    ];
    for (const style of bad) {
      expect(() => checkStyle(style as never, "test"), JSON.stringify(style)).toThrow(MapError);
    }
    expect(() => checkStyle({ fill: { gray: 0.8, hatch: { angleDegrees: 45, spacingMm: 2, widthMm: 0.3, cross: true } } }, "test")).not.toThrow();
  });

  it("give gray colors, dashes, hatches and symbols in SVG", () => {
    expect(grayColor(0)).toBe("#000000");
    expect(grayColor(0.5)).toBe("#808080");
    expect(grayColor(1)).toBe("#ffffff");
    expect(mm(1.006)).toBe("1.01");
    expect(mm(-0.001)).toBe("0");
    expect(strokeAttributes({ widthMm: 0.5, dashMm: [2, 1] })).toContain(`stroke-dasharray="2 1"`);
    expect(strokeAttributes({ widthMm: 0.5 })).not.toContain("dasharray");
    const hatch = hatchPattern("m-zone-hatch", { angleDegrees: 45, spacingMm: 2, widthMm: 0.3, cross: true });
    expect(hatch).toContain(`id="m-zone-hatch"`);
    expect(hatch).toContain("rotate(45)");
    expect(hatch.match(/<line /g)).toHaveLength(2);
    for (const symbol of ["circle", "square", "triangle", "diamond", "cross"] as const) {
      expect(pointSymbol({ symbol, sizeMm: 2, filled: false }, 5, 5)).toMatch(/^<(circle|rect|path) /);
    }
  });
});
