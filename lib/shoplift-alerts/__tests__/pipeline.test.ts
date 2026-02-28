import { runShopliftAlertPipeline } from "@/lib/shoplift-alerts/pipeline";
import { createStubShopliftingEvent } from "@/lib/shoplift-alerts/types";

jest.mock("@/lib/shoplift-alerts/alert-gate");
jest.mock("@/lib/shoplift-alerts/incident-log");
jest.mock("@/lib/grocery-shoplift/voice");
jest.mock("@/lib/shoplift-alerts/playback");

import { alertGate } from "@/lib/shoplift-alerts/alert-gate";
import { logTriggered, logSuppressed } from "@/lib/shoplift-alerts/incident-log";
import { getVoiceAlert } from "@/lib/grocery-shoplift/voice";
import { playAudioNonBlocking } from "@/lib/shoplift-alerts/playback";

const mockAlertGate = alertGate as jest.MockedFunction<typeof alertGate>;
const mockLogTriggered = logTriggered as jest.MockedFunction<typeof logTriggered>;
const mockLogSuppressed = logSuppressed as jest.MockedFunction<typeof logSuppressed>;
const mockGetVoiceAlert = getVoiceAlert as jest.MockedFunction<typeof getVoiceAlert>;
const mockPlayAudio = playAudioNonBlocking as jest.MockedFunction<typeof playAudioNonBlocking>;

const testEvent = createStubShopliftingEvent();

beforeEach(() => {
  jest.clearAllMocks();
  mockLogTriggered.mockResolvedValue(undefined);
  mockLogSuppressed.mockResolvedValue(undefined);
  mockPlayAudio.mockResolvedValue(undefined);
});

describe("runShopliftAlertPipeline() — gate blocks", () => {
  it("returns triggered: false with reason 'below_threshold' and calls logSuppressed", async () => {
    mockAlertGate.mockReturnValue({
      allowed: false,
      reason: "below_threshold",
      event: testEvent,
    });

    const result = await runShopliftAlertPipeline(testEvent);

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("below_threshold");
    expect(mockLogSuppressed).toHaveBeenCalledWith(testEvent, "below_threshold");
    expect(mockLogTriggered).not.toHaveBeenCalled();
  });

  it("returns triggered: false with reason 'cooldown' and calls logSuppressed", async () => {
    mockAlertGate.mockReturnValue({
      allowed: false,
      reason: "cooldown",
      event: testEvent,
    });

    const result = await runShopliftAlertPipeline(testEvent);

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("cooldown");
    expect(mockLogSuppressed).toHaveBeenCalledWith(testEvent, "cooldown");
  });

  it("does not call voice or logTriggered when gate blocks", async () => {
    mockAlertGate.mockReturnValue({
      allowed: false,
      reason: "persistence_not_met",
      event: testEvent,
    });

    await runShopliftAlertPipeline(testEvent);

    expect(mockGetVoiceAlert).not.toHaveBeenCalled();
    expect(mockLogTriggered).not.toHaveBeenCalled();
  });
});

describe("runShopliftAlertPipeline() — gate allows", () => {
  beforeEach(() => {
    mockAlertGate.mockReturnValue({ allowed: true, event: testEvent });
  });

  it("returns triggered: true with audioPath when voice succeeds", async () => {
    const mockPlay = jest.fn().mockResolvedValue({
      audioPath: "/tmp/alert.wav",
      voiceUsed: "local",
    });
    mockGetVoiceAlert.mockReturnValue({ play: mockPlay } as any);

    const result = await runShopliftAlertPipeline(testEvent);

    expect(result.triggered).toBe(true);
    expect(result.audioPath).toBe("/tmp/alert.wav");
    expect(mockLogTriggered).toHaveBeenCalled();
    expect(mockLogSuppressed).not.toHaveBeenCalled();
  });

  it("calls logTriggered with event and audioPath", async () => {
    const mockPlay = jest.fn().mockResolvedValue({
      audioPath: "/tmp/beep.wav",
      voiceUsed: "local",
    });
    mockGetVoiceAlert.mockReturnValue({ play: mockPlay } as any);

    await runShopliftAlertPipeline(testEvent);

    expect(mockLogTriggered).toHaveBeenCalledWith(
      testEvent,
      expect.stringContaining(testEvent.location),
      "/tmp/beep.wav",
      undefined
    );
  });

  it("returns triggered: false with reason 'voice_failed' when audioPath is undefined", async () => {
    const mockPlay = jest.fn().mockResolvedValue({ audioPath: undefined, voiceUsed: "local" });
    mockGetVoiceAlert.mockReturnValue({ play: mockPlay } as any);

    const result = await runShopliftAlertPipeline(testEvent);

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe("voice_failed");
    expect(mockLogSuppressed).toHaveBeenCalledWith(testEvent, "voice_failed");
  });
});

describe("runShopliftAlertPipeline() — unexpected error", () => {
  it("returns triggered: false with reason 'pipeline_error' on unexpected throw", async () => {
    mockAlertGate.mockReturnValue({ allowed: true, event: testEvent });
    mockGetVoiceAlert.mockImplementation(() => {
      throw new Error("unexpected crash");
    });

    const result = await runShopliftAlertPipeline(testEvent);

    expect(result.triggered).toBe(false);
    // The pipeline hardcodes "pipeline_error" as reason in the return value
    expect(result.reason).toBe("pipeline_error");
  });
});
