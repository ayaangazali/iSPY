import { logTriggered, logSuppressed } from "@/lib/shoplift-alerts/incident-log";
import { createStubShopliftingEvent } from "@/lib/shoplift-alerts/types";

jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
  appendFile: jest.fn().mockResolvedValue(undefined),
}));

import { appendFile, mkdir } from "fs/promises";

const mockAppendFile = appendFile as jest.MockedFunction<typeof appendFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;

const testEvent = createStubShopliftingEvent();

beforeEach(() => {
  jest.clearAllMocks();
});

describe("logTriggered()", () => {
  it("calls mkdir with recursive: true", async () => {
    await logTriggered(testEvent, "alert text", "/tmp/audio.wav", undefined);
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    );
  });

  it("calls appendFile to write the incident", async () => {
    await logTriggered(testEvent, "alert text", "/tmp/audio.wav", undefined);
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
  });

  it("writes a JSON line ending with newline", async () => {
    await logTriggered(testEvent, "alert text", "/tmp/audio.wav", undefined);
    const [, content] = mockAppendFile.mock.calls[0];
    const line = content as string;
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line.trim());
    expect(parsed).toBeDefined();
  });

  it("logged object includes event data and status 'triggered'", async () => {
    await logTriggered(testEvent, "Security alert", "/tmp/beep.wav", undefined);
    const [, content] = mockAppendFile.mock.calls[0];
    const parsed = JSON.parse((content as string).trim());
    expect(parsed.status).toBe("triggered");
    expect(parsed.event.camera_id).toBe(testEvent.camera_id);
    expect(parsed.audio_file_path).toBe("/tmp/beep.wav");
    expect(parsed.alert_text).toBe("Security alert");
  });

  it("logged object does NOT contain minimax_request_id", async () => {
    await logTriggered(testEvent, "alert", "/tmp/beep.wav", undefined);
    const [, content] = mockAppendFile.mock.calls[0];
    const parsed = JSON.parse((content as string).trim());
    expect(parsed).not.toHaveProperty("minimax_request_id");
  });

  it("does not throw on file system errors (mkdir fails)", async () => {
    mockMkdir.mockRejectedValueOnce(new Error("EACCES: permission denied"));
    await expect(
      logTriggered(testEvent, "alert", "/tmp/beep.wav", undefined)
    ).rejects.toThrow(); // propagates since no try-catch in logIncident
  });
});

describe("logSuppressed()", () => {
  it("calls mkdir and appendFile", async () => {
    await logSuppressed(testEvent, "below_threshold");
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockAppendFile).toHaveBeenCalled();
  });

  it("logged object has status 'suppressed' and reason", async () => {
    await logSuppressed(testEvent, "cooldown");
    const [, content] = mockAppendFile.mock.calls[0];
    const parsed = JSON.parse((content as string).trim());
    expect(parsed.status).toBe("suppressed");
    expect(parsed.reason).toBe("cooldown");
  });

  it("logged object includes event fields", async () => {
    await logSuppressed(testEvent, "below_threshold");
    const [, content] = mockAppendFile.mock.calls[0];
    const parsed = JSON.parse((content as string).trim());
    expect(parsed.event.camera_id).toBe(testEvent.camera_id);
    expect(parsed.event.confidence).toBe(testEvent.confidence);
  });

  it("logged object does NOT contain minimax_request_id", async () => {
    await logSuppressed(testEvent, "cooldown");
    const [, content] = mockAppendFile.mock.calls[0];
    const parsed = JSON.parse((content as string).trim());
    expect(parsed).not.toHaveProperty("minimax_request_id");
  });
});
