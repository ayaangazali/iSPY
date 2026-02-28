import {
  isShopliftingEvent,
  fromTheftEvent,
  createStubShopliftingEvent,
  SHOPLIFTING_EVENT_TYPE,
} from "@/lib/shoplift-alerts/types";

const validEvent = {
  event_type: SHOPLIFTING_EVENT_TYPE,
  camera_id: "cam-1",
  location: "Aisle 3",
  confidence: 0.9,
  timestamp: new Date().toISOString(),
};

describe("isShopliftingEvent()", () => {
  it("returns true for a valid event", () => {
    expect(isShopliftingEvent(validEvent)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isShopliftingEvent(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isShopliftingEvent("string")).toBe(false);
    expect(isShopliftingEvent(42)).toBe(false);
  });

  it("returns false when event_type is wrong", () => {
    expect(isShopliftingEvent({ ...validEvent, event_type: "wrong_type" })).toBe(false);
  });

  it("returns false when camera_id is missing", () => {
    const { camera_id: _, ...rest } = validEvent;
    expect(isShopliftingEvent(rest)).toBe(false);
  });

  it("returns false when camera_id is not a string", () => {
    expect(isShopliftingEvent({ ...validEvent, camera_id: 42 })).toBe(false);
  });

  it("returns false when location is missing", () => {
    const { location: _, ...rest } = validEvent;
    expect(isShopliftingEvent(rest)).toBe(false);
  });

  it("returns false when confidence is not a number", () => {
    expect(isShopliftingEvent({ ...validEvent, confidence: "high" })).toBe(false);
  });

  it("returns false when confidence is below 0", () => {
    expect(isShopliftingEvent({ ...validEvent, confidence: -0.1 })).toBe(false);
  });

  it("returns false when confidence is above 1", () => {
    expect(isShopliftingEvent({ ...validEvent, confidence: 1.1 })).toBe(false);
  });

  it("returns true for confidence exactly 0", () => {
    expect(isShopliftingEvent({ ...validEvent, confidence: 0 })).toBe(true);
  });

  it("returns true for confidence exactly 1", () => {
    expect(isShopliftingEvent({ ...validEvent, confidence: 1 })).toBe(true);
  });

  it("returns false when timestamp is missing", () => {
    const { timestamp: _, ...rest } = validEvent;
    expect(isShopliftingEvent(rest)).toBe(false);
  });

  it("returns true when optional evidence is present", () => {
    expect(
      isShopliftingEvent({ ...validEvent, evidence: { keyframe_path: "/tmp/img.jpg" } })
    ).toBe(true);
  });
});

describe("fromTheftEvent()", () => {
  const baseTheft = {
    id: "t1",
    cameraId: "cam-2",
    suspicionScore: 85,
    timestamp: new Date("2024-01-01T12:00:00Z"),
  };

  it("converts suspicionScore 100 to confidence 1.0", () => {
    const ev = fromTheftEvent({ ...baseTheft, suspicionScore: 100 });
    expect(ev.confidence).toBe(1.0);
  });

  it("converts suspicionScore 0 to confidence 0", () => {
    const ev = fromTheftEvent({ ...baseTheft, suspicionScore: 0 });
    expect(ev.confidence).toBe(0);
  });

  it("converts suspicionScore 85 to confidence 0.85", () => {
    const ev = fromTheftEvent({ ...baseTheft, suspicionScore: 85 });
    expect(ev.confidence).toBeCloseTo(0.85);
  });

  it("clamps confidence to 1 for scores above 100", () => {
    const ev = fromTheftEvent({ ...baseTheft, suspicionScore: 150 });
    expect(ev.confidence).toBe(1);
  });

  it("clamps confidence to 0 for negative scores", () => {
    const ev = fromTheftEvent({ ...baseTheft, suspicionScore: -10 });
    expect(ev.confidence).toBe(0);
  });

  it("populates evidence when keyframes are present", () => {
    const ev = fromTheftEvent({
      ...baseTheft,
      keyframes: ["base64imagedata"],
    });
    expect(ev.evidence).toBeDefined();
    expect(ev.evidence?.keyframe_base64).toBe("base64imagedata");
  });

  it("leaves evidence undefined when keyframes are empty", () => {
    const ev = fromTheftEvent({ ...baseTheft, keyframes: [] });
    expect(ev.evidence).toBeUndefined();
  });

  it("uses locationLabel when provided", () => {
    const ev = fromTheftEvent(baseTheft, "Electronics Section");
    expect(ev.location).toBe("Electronics Section");
  });

  it("falls back to zoneId when locationLabel is absent", () => {
    const ev = fromTheftEvent({ ...baseTheft, zoneId: "zone-electronics" });
    expect(ev.location).toBe("zone-electronics");
  });

  it("uses 'Unknown area' when neither locationLabel nor zoneId", () => {
    const ev = fromTheftEvent(baseTheft);
    expect(ev.location).toBe("Unknown area");
  });

  it("sets correct event_type", () => {
    const ev = fromTheftEvent(baseTheft);
    expect(ev.event_type).toBe(SHOPLIFTING_EVENT_TYPE);
  });

  it("converts timestamp to ISO string", () => {
    const ev = fromTheftEvent(baseTheft);
    expect(ev.timestamp).toBe("2024-01-01T12:00:00.000Z");
  });
});

describe("createStubShopliftingEvent()", () => {
  it("creates a valid event with defaults", () => {
    const ev = createStubShopliftingEvent();
    expect(isShopliftingEvent(ev)).toBe(true);
  });

  it("default camera_id is 'cam-test-1'", () => {
    expect(createStubShopliftingEvent().camera_id).toBe("cam-test-1");
  });

  it("default location is 'Aisle 6'", () => {
    expect(createStubShopliftingEvent().location).toBe("Aisle 6");
  });

  it("default confidence is 0.85", () => {
    expect(createStubShopliftingEvent().confidence).toBe(0.85);
  });

  it("default event_type is SHOPLIFTING_EVENT_TYPE", () => {
    expect(createStubShopliftingEvent().event_type).toBe(SHOPLIFTING_EVENT_TYPE);
  });

  it("overrides are applied correctly", () => {
    const ev = createStubShopliftingEvent({
      camera_id: "cam-override",
      confidence: 0.5,
      location: "Entrance",
    });
    expect(ev.camera_id).toBe("cam-override");
    expect(ev.confidence).toBe(0.5);
    expect(ev.location).toBe("Entrance");
  });

  it("evidence override is applied", () => {
    const ev = createStubShopliftingEvent({
      evidence: { keyframe_path: "/tmp/test.jpg" },
    });
    expect(ev.evidence?.keyframe_path).toBe("/tmp/test.jpg");
  });

  it("has no evidence by default", () => {
    const ev = createStubShopliftingEvent();
    expect(ev.evidence).toBeUndefined();
  });
});
