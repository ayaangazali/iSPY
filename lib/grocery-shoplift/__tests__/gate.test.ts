import { alertGate, resetGate, getGateConfig } from "@/lib/grocery-shoplift/gate";

function makeInput(overrides: Partial<Parameters<typeof alertGate>[0]> = {}) {
  return {
    camera_id: "cam-1",
    track_id: "t1",
    judge_confidence_0_1: 0.9,
    now_ms: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  resetGate();
  delete process.env.SHOPLIFT_CAMERA_COOLDOWN_SECONDS;
  delete process.env.SHOPLIFT_TRACK_COOLDOWN_SECONDS;
  delete process.env.SHOPLIFT_JUDGE_MIN_CONFIDENCE;
});

afterEach(() => {
  resetGate();
  delete process.env.SHOPLIFT_CAMERA_COOLDOWN_SECONDS;
  delete process.env.SHOPLIFT_TRACK_COOLDOWN_SECONDS;
  delete process.env.SHOPLIFT_JUDGE_MIN_CONFIDENCE;
});

describe("alertGate() — confidence check", () => {
  it("returns { allow: false, reason: 'below_confidence' } when confidence is below default (0.7)", () => {
    const result = alertGate(makeInput({ judge_confidence_0_1: 0.5 }));
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe("below_confidence");
  });

  it("allows when confidence is exactly at the threshold", () => {
    const result = alertGate(makeInput({ judge_confidence_0_1: 0.7 }));
    expect(result.allow).toBe(true);
  });

  it("allows when confidence is above the threshold", () => {
    const result = alertGate(makeInput({ judge_confidence_0_1: 0.95 }));
    expect(result.allow).toBe(true);
  });

  it("respects SHOPLIFT_JUDGE_MIN_CONFIDENCE env var", () => {
    process.env.SHOPLIFT_JUDGE_MIN_CONFIDENCE = "0.9";
    const result = alertGate(makeInput({ judge_confidence_0_1: 0.85 }));
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe("below_confidence");
  });
});

describe("alertGate() — camera cooldown", () => {
  it("allows first event for a camera", () => {
    const result = alertGate(makeInput({ now_ms: 1000 }));
    expect(result.allow).toBe(true);
  });

  it("blocks second event within camera cooldown", () => {
    const now = 100_000;
    alertGate(makeInput({ camera_id: "cam-A", track_id: "t1", now_ms: now }));
    const result = alertGate(makeInput({ camera_id: "cam-A", track_id: "t2", now_ms: now + 1000 }));
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe("camera_cooldown");
  });

  it("allows event after camera cooldown has expired", () => {
    const now = 100_000;
    // default cooldown is 20s
    alertGate(makeInput({ camera_id: "cam-B", track_id: "t1", now_ms: now }));
    const result = alertGate(makeInput({ camera_id: "cam-B", track_id: "t2", now_ms: now + 25_000 }));
    expect(result.allow).toBe(true);
  });

  it("SHOPLIFT_CAMERA_COOLDOWN_SECONDS=0 disables camera cooldown", () => {
    process.env.SHOPLIFT_CAMERA_COOLDOWN_SECONDS = "0";
    const now = 100_000;
    alertGate(makeInput({ camera_id: "cam-C", track_id: "t1", now_ms: now }));
    const result = alertGate(makeInput({ camera_id: "cam-C", track_id: "t2", now_ms: now + 1 }));
    // With 0 cooldown, camera cooldown doesn't block. Track cooldown might still apply.
    // Different track so track cooldown won't apply
    expect(result.allow).toBe(true);
  });
});

describe("alertGate() — track cooldown", () => {
  it("blocks second event for same track within track cooldown", () => {
    const now = 200_000;
    alertGate(makeInput({ track_id: "track-X", camera_id: "cam-1", now_ms: now }));
    // Use different camera so camera cooldown doesn't apply
    const result = alertGate(makeInput({ track_id: "track-X", camera_id: "cam-2", now_ms: now + 5000 }));
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.reason).toBe("track_cooldown");
  });

  it("allows same track after track cooldown expires", () => {
    const now = 200_000;
    // default track cooldown is 30s
    alertGate(makeInput({ track_id: "track-Y", camera_id: "cam-1", now_ms: now }));
    const result = alertGate(makeInput({ track_id: "track-Y", camera_id: "cam-2", now_ms: now + 35_000 }));
    expect(result.allow).toBe(true);
  });
});

describe("resetGate()", () => {
  it("clears cooldowns so next event is allowed", () => {
    const now = 300_000;
    alertGate(makeInput({ camera_id: "cam-D", track_id: "t1", now_ms: now }));
    // Should be blocked
    const blocked = alertGate(makeInput({ camera_id: "cam-D", track_id: "t2", now_ms: now + 100 }));
    expect(blocked.allow).toBe(false);

    resetGate();
    // After reset should be allowed
    const allowed = alertGate(makeInput({ camera_id: "cam-D", track_id: "t2", now_ms: now + 100 }));
    expect(allowed.allow).toBe(true);
  });
});

describe("getGateConfig()", () => {
  it("returns numeric values for all settings", () => {
    const config = getGateConfig();
    expect(typeof config.cameraCooldownSeconds).toBe("number");
    expect(typeof config.trackCooldownSeconds).toBe("number");
    expect(typeof config.judgeMinConfidence).toBe("number");
  });

  it("returns default values when no env vars set", () => {
    const config = getGateConfig();
    expect(config.cameraCooldownSeconds).toBe(20);
    expect(config.trackCooldownSeconds).toBe(30);
    expect(config.judgeMinConfidence).toBe(0.7);
  });

  it("reflects env var overrides", () => {
    process.env.SHOPLIFT_CAMERA_COOLDOWN_SECONDS = "5";
    process.env.SHOPLIFT_JUDGE_MIN_CONFIDENCE = "0.8";
    const config = getGateConfig();
    expect(config.cameraCooldownSeconds).toBe(5);
    expect(config.judgeMinConfidence).toBe(0.8);
  });
});
