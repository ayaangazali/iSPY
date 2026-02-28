import { updateTracks, resetTracks, getActiveTracks } from "@/lib/grocery-shoplift/tracking";
import type { PersonDetection } from "@/lib/grocery-shoplift/types";

function makeDet(x1: number, y1: number, x2: number, y2: number, conf = 0.9): PersonDetection {
  return { bbox: { x1, y1, x2, y2 }, confidence: conf };
}

beforeEach(() => {
  resetTracks();
});

describe("updateTracks() — new detections", () => {
  it("creates a new track for a single detection", () => {
    const result = updateTracks([makeDet(0, 0, 50, 100)], 1000);
    expect(result).toHaveLength(1);
    expect(result[0].track_id).toBeDefined();
    expect(typeof result[0].track_id).toBe("string");
  });

  it("returns track with correct bbox", () => {
    const result = updateTracks([makeDet(10, 20, 60, 120)], 1000);
    expect(result[0].bbox).toEqual({ x1: 10, y1: 20, x2: 60, y2: 120 });
  });

  it("multiple non-overlapping detections get distinct track_ids", () => {
    const result = updateTracks(
      [
        makeDet(0, 0, 50, 100),
        makeDet(200, 200, 250, 300),
        makeDet(400, 0, 450, 100),
      ],
      1000
    );
    expect(result).toHaveLength(3);
    const ids = result.map((t) => t.track_id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("updateTracks() — track matching (IOU > 0.3)", () => {
  it("same overlapping detection in next frame gets same track_id", () => {
    const det = makeDet(0, 0, 100, 100);
    const first = updateTracks([det], 1000);
    const firstId = first[0].track_id;

    // Slightly shifted — still high IOU
    const det2 = makeDet(5, 5, 105, 105);
    const second = updateTracks([det2], 2000);

    expect(second[0].track_id).toBe(firstId);
  });

  it("non-overlapping detection gets a new track_id", () => {
    const first = updateTracks([makeDet(0, 0, 50, 50)], 1000);
    const firstId = first[0].track_id;

    const second = updateTracks([makeDet(300, 300, 350, 350)], 2000);
    expect(second[0].track_id).not.toBe(firstId);
  });

  it("bbox_history accumulates over frames", () => {
    const det1 = makeDet(0, 0, 100, 100);
    updateTracks([det1], 1000);
    const det2 = makeDet(5, 5, 105, 105);
    const result = updateTracks([det2], 2000);
    expect(result[0].bbox_history.length).toBeGreaterThanOrEqual(2);
  });
});

describe("resetTracks()", () => {
  it("clears all active tracks", () => {
    updateTracks([makeDet(0, 0, 50, 100)], 1000);
    updateTracks([makeDet(200, 200, 250, 300)], 1001);
    resetTracks();
    expect(getActiveTracks()).toHaveLength(0);
  });

  it("after reset, new detection gets a fresh track starting from t1", () => {
    updateTracks([makeDet(0, 0, 50, 50)], 1000);
    resetTracks();
    const result = updateTracks([makeDet(0, 0, 50, 50)], 2000);
    expect(result[0].track_id).toBe("t1");
  });
});

describe("track metadata", () => {
  it("first_seen is set on initial detection", () => {
    const result = updateTracks([makeDet(0, 0, 50, 50)], 5000);
    expect(result[0].first_seen).toBe(5000);
  });

  it("last_seen is updated on each frame", () => {
    updateTracks([makeDet(0, 0, 50, 50)], 1000);
    const result = updateTracks([makeDet(5, 5, 55, 55)], 3000);
    expect(result[0].last_seen).toBe(3000);
  });

  it("track confidence reflects the latest detection", () => {
    updateTracks([makeDet(0, 0, 50, 50, 0.8)], 1000);
    const result = updateTracks([makeDet(5, 5, 55, 55, 0.95)], 2000);
    expect(result[0].confidence).toBe(0.95);
  });
});
