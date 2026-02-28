import {
  getConcealmentJudge,
  LocalFallbackJudge,
  initConcealmentJudge,
} from "@/lib/grocery-shoplift/judge";
import type { ConcealmentJudgeInput } from "@/lib/grocery-shoplift/judge";

function makeInput(overrides: Partial<ConcealmentJudgeInput> = {}): ConcealmentJudgeInput {
  return {
    framePaths: [],
    location: "Aisle 3",
    cameraId: "cam-1",
    suspicionScore: 50,
    suspicionReasons: [],
    exitWithoutCheckout: false,
    torsoRatioSpike: false,
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.ENABLE_GEMINI_VLM;
});

describe("getConcealmentJudge()", () => {
  it("returns a judge object with a judge() method", () => {
    const judge = getConcealmentJudge();
    expect(judge).toBeDefined();
    expect(typeof judge.judge).toBe("function");
  });

  it("returns a LocalFallbackJudge when ENABLE_GEMINI_VLM is not set", () => {
    const judge = getConcealmentJudge();
    expect(judge).toBeInstanceOf(LocalFallbackJudge);
  });
});

describe("initConcealmentJudge()", () => {
  it("returns a judge instance", async () => {
    const judge = await initConcealmentJudge();
    expect(judge).toBeDefined();
    expect(typeof judge.judge).toBe("function");
  });
});

describe("LocalFallbackJudge.judge()", () => {
  let judge: LocalFallbackJudge;

  beforeEach(() => {
    judge = new LocalFallbackJudge();
  });

  it("returns an object with required fields", async () => {
    const result = await judge.judge(makeInput());
    expect(result).toHaveProperty("concealment_likely");
    expect(result).toHaveProperty("confidence_0_1");
    expect(result).toHaveProperty("evidence");
    expect(result).toHaveProperty("risk_of_false_positive");
    expect(result).toHaveProperty("recommended_action");
  });

  it("isSuspicious (concealment_likely) is boolean", async () => {
    const result = await judge.judge(makeInput());
    expect(typeof result.concealment_likely).toBe("boolean");
  });

  it("confidence_0_1 is between 0 and 1", async () => {
    const result = await judge.judge(makeInput());
    expect(result.confidence_0_1).toBeGreaterThanOrEqual(0);
    expect(result.confidence_0_1).toBeLessThanOrEqual(1);
  });

  it("high concealment scenario: exitWithoutCheckout=true → concealment_likely true", async () => {
    const result = await judge.judge(makeInput({ exitWithoutCheckout: true }));
    expect(result.concealment_likely).toBe(true);
    expect(result.confidence_0_1).toBeGreaterThanOrEqual(0.7);
  });

  it("high concealment scenario: torsoRatioSpike=true → concealment_likely true", async () => {
    const result = await judge.judge(makeInput({ torsoRatioSpike: true }));
    expect(result.concealment_likely).toBe(true);
  });

  it("low concealment scenario: both flags false → concealment_likely false", async () => {
    const result = await judge.judge(makeInput({ exitWithoutCheckout: false, torsoRatioSpike: false }));
    expect(result.concealment_likely).toBe(false);
    expect(result.confidence_0_1).toBeLessThan(0.5);
  });

  it("evidence includes 'exit_without_checkout' when applicable", async () => {
    const result = await judge.judge(makeInput({ exitWithoutCheckout: true }));
    expect(result.evidence).toContain("exit_without_checkout");
  });

  it("evidence includes 'torso_ratio_spike' when applicable", async () => {
    const result = await judge.judge(makeInput({ torsoRatioSpike: true }));
    expect(result.evidence).toContain("torso_ratio_spike");
  });

  it("evidence is empty when no flags are set", async () => {
    const result = await judge.judge(makeInput());
    expect(result.evidence).toHaveLength(0);
  });

  it("recommended_action is 'alert' for high-concealment scenario", async () => {
    const result = await judge.judge(makeInput({ exitWithoutCheckout: true }));
    expect(result.recommended_action).toBe("alert");
  });

  it("recommended_action is 'log_only' for non-suspicious scenario", async () => {
    const result = await judge.judge(makeInput());
    expect(result.recommended_action).toBe("log_only");
  });
});
