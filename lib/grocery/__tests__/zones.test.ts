import {
  isPointInPolygon,
  getBoundingBoxCenter,
  polygonToPixels,
  pixelsToPolygon,
  calculateRiskMultiplier,
} from "@/lib/grocery/zones";
import type { Zone, Point } from "@/lib/grocery/types";

// A unit square polygon [0,0] → [1,0] → [1,1] → [0,1]
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function makeZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: "z1",
    name: "Test Zone",
    type: "general",
    polygon: square,
    color: "#ff0000",
    riskMultiplier: 1.5,
    enabled: true,
    ...overrides,
  };
}

describe("isPointInPolygon()", () => {
  it("returns true for a point inside the square", () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
  });

  it("returns false for a point outside the square", () => {
    expect(isPointInPolygon({ x: 2, y: 2 }, square)).toBe(false);
  });

  it("returns false for a point far outside", () => {
    expect(isPointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });

  it("returns false for a degenerate polygon with less than 3 points", () => {
    const twoPoints: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, twoPoints)).toBe(false);
  });

  it("returns false for an empty polygon", () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, [])).toBe(false);
  });

  it("works for a triangular polygon", () => {
    const triangle: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }];
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, triangle)).toBe(true);
    expect(isPointInPolygon({ x: 0.9, y: 0.9 }, triangle)).toBe(false);
  });
});

describe("getBoundingBoxCenter()", () => {
  it("returns (0.5, 0.5) for a unit box", () => {
    const center = getBoundingBoxCenter({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(center.x).toBeCloseTo(0.5);
    expect(center.y).toBeCloseTo(0.5);
  });

  it("returns correct center for (0,0,100,200)", () => {
    const center = getBoundingBoxCenter({ x1: 0, y1: 0, x2: 100, y2: 200 });
    expect(center.x).toBe(50);
    expect(center.y).toBe(100);
  });

  it("returns correct center for a non-origin box", () => {
    const center = getBoundingBoxCenter({ x1: 10, y1: 20, x2: 30, y2: 60 });
    expect(center.x).toBe(20);
    expect(center.y).toBe(40);
  });
});

describe("polygonToPixels() and pixelsToPolygon() roundtrip", () => {
  it("converts and converts back, result matches original within floating-point", () => {
    const normalized: Point[] = [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.3 },
      { x: 0.5, y: 0.9 },
    ];
    const width = 640;
    const height = 480;

    const pixels = polygonToPixels(normalized, width, height);
    const restored = pixelsToPolygon(pixels, width, height);

    // Roundtrip through pixel rounding introduces small error
    expect(restored[0].x).toBeCloseTo(normalized[0].x, 1);
    expect(restored[0].y).toBeCloseTo(normalized[0].y, 1);
    expect(restored[1].x).toBeCloseTo(normalized[1].x, 1);
    expect(restored[2].y).toBeCloseTo(normalized[2].y, 1);
  });

  it("polygonToPixels scales by width and height", () => {
    const polygon: Point[] = [{ x: 0.5, y: 0.5 }];
    const pixels = polygonToPixels(polygon, 200, 100);
    expect(pixels[0].x).toBe(100);
    expect(pixels[0].y).toBe(50);
  });

  it("pixelsToPolygon normalizes correctly", () => {
    const pixels = [{ x: 100, y: 50 }];
    const result = pixelsToPolygon(pixels, 200, 100);
    expect(result[0].x).toBeCloseTo(0.5);
    expect(result[0].y).toBeCloseTo(0.5);
  });
});

describe("calculateRiskMultiplier()", () => {
  it("returns 1.0 when point is not in any zone", () => {
    const zones = [makeZone()]; // zone covers [0,0]-[1,1]
    const result = calculateRiskMultiplier({ x: 5, y: 5 }, zones);
    expect(result).toBe(1.0);
  });

  it("returns zone's riskMultiplier when point is inside a zone", () => {
    const zones = [makeZone({ riskMultiplier: 2.5 })];
    const result = calculateRiskMultiplier({ x: 0.5, y: 0.5 }, zones);
    expect(result).toBe(2.5);
  });

  it("high-risk zones return multiplier > 1", () => {
    const zones = [makeZone({ type: "high_theft", riskMultiplier: 1.8 })];
    const result = calculateRiskMultiplier({ x: 0.5, y: 0.5 }, zones);
    expect(result).toBeGreaterThan(1);
  });

  it("returns max multiplier when point is in multiple overlapping zones", () => {
    const zones = [
      makeZone({ id: "z1", riskMultiplier: 1.5 }),
      makeZone({ id: "z2", riskMultiplier: 3.0 }),
    ];
    const result = calculateRiskMultiplier({ x: 0.5, y: 0.5 }, zones);
    expect(result).toBe(3.0);
  });

  it("ignores disabled zones", () => {
    const zones = [makeZone({ riskMultiplier: 5.0, enabled: false })];
    const result = calculateRiskMultiplier({ x: 0.5, y: 0.5 }, zones);
    expect(result).toBe(1.0);
  });
});
