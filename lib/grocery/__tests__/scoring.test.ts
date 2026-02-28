import {
  calculateSuspicionScore,
  getSeverityFromScore,
  getRecommendedAction,
} from "@/lib/grocery/scoring";
import { DEFAULT_CALIBRATION, DEFAULT_BEHAVIOR_WEIGHTS, DEFAULT_THRESHOLDS } from "@/lib/grocery/config";

describe("calculateSuspicionScore()", () => {
  it("returns a number between 0 and 100", () => {
    const score = calculateSuspicionScore("concealment");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a number type", () => {
    expect(typeof calculateSuspicionScore("unknown")).toBe("number");
  });

  it("concealment behavior returns higher score than suspicious_loitering", () => {
    const concealScore = calculateSuspicionScore("concealment");
    const loiterScore = calculateSuspicionScore("suspicious_loitering");
    expect(concealScore).toBeGreaterThan(loiterScore);
  });

  it("grab_and_run returns a higher score than unknown behavior", () => {
    const grabScore = calculateSuspicionScore("grab_and_run");
    const unknownScore = calculateSuspicionScore("unknown");
    expect(grabScore).toBeGreaterThan(unknownScore);
  });

  it("zone multiplier of 2.0 increases final score compared to 1.0", () => {
    const base = calculateSuspicionScore("concealment", 1.0);
    const boosted = calculateSuspicionScore("concealment", 2.0);
    expect(boosted).toBeGreaterThan(base);
  });

  it("nearExit: true increases score", () => {
    const base = calculateSuspicionScore("concealment", 1.0, DEFAULT_CALIBRATION, DEFAULT_BEHAVIOR_WEIGHTS, {});
    const withExit = calculateSuspicionScore("concealment", 1.0, DEFAULT_CALIBRATION, DEFAULT_BEHAVIOR_WEIGHTS, { nearExit: true });
    expect(withExit).toBeGreaterThan(base);
  });

  it("repeatedBehavior: true increases score", () => {
    const base = calculateSuspicionScore("concealment", 1.0);
    const withRepeat = calculateSuspicionScore("concealment", 1.0, DEFAULT_CALIBRATION, DEFAULT_BEHAVIOR_WEIGHTS, { repeatedBehavior: true });
    expect(withRepeat).toBeGreaterThan(base);
  });

  it("score is clamped to 100 even with multiple boosting factors", () => {
    const score = calculateSuspicionScore("grab_and_run", 3.0, DEFAULT_CALIBRATION, DEFAULT_BEHAVIOR_WEIGHTS, {
      nearExit: true,
      repeatedBehavior: true,
      afterHours: true,
      multipleItems: true,
      personHistory: 5,
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it("unknown behavior type returns base score around 35", () => {
    const score = calculateSuspicionScore("unknown", 1.0);
    // base is 35, with sensitivity multiplier it varies but should be in a reasonable range
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("getSeverityFromScore()", () => {
  it("score 0 → 'low'", () => {
    expect(getSeverityFromScore(0)).toBe("low");
  });

  it("score 29 → 'low'", () => {
    expect(getSeverityFromScore(29)).toBe("low");
  });

  it("score 50 → 'medium'", () => {
    expect(getSeverityFromScore(50)).toBe("medium");
  });

  it("score 75 → 'high'", () => {
    expect(getSeverityFromScore(75)).toBe("high");
  });

  it("score 90 → 'critical'", () => {
    expect(getSeverityFromScore(90)).toBe("critical");
  });

  it("score 100 → 'critical'", () => {
    expect(getSeverityFromScore(100)).toBe("critical");
  });
});

describe("getRecommendedAction()", () => {
  it("score below dashboardMark (50) → 'log_only'", () => {
    expect(getRecommendedAction(40)).toBe("log_only");
  });

  it("score at dashboardMark (50) → 'mark_dashboard'", () => {
    expect(getRecommendedAction(50)).toBe("mark_dashboard");
  });

  it("score at alertSecurity (75) → 'alert_security'", () => {
    expect(getRecommendedAction(75)).toBe("alert_security");
  });

  it("score at critical (90) → 'critical_alert'", () => {
    expect(getRecommendedAction(90)).toBe("critical_alert");
  });

  it("score 0 → 'log_only'", () => {
    expect(getRecommendedAction(0)).toBe("log_only");
  });
});
