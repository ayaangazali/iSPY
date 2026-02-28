import { POST } from "@/app/api/theft-voice/route";

jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockRejectedValue(new Error("ENOENT")),
  appendFile: jest.fn().mockResolvedValue(undefined),
}));

import { writeFile, mkdir } from "fs/promises";

const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;

function makeReq(body: object | null) {
  return new Request("http://localhost/api/theft-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/theft-voice", () => {
  it("returns success:true with voiceUsed:'local' and audioPath", async () => {
    const res = await POST(makeReq({ cameraId: "cam-entrance" }) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.voiceUsed).toBe("local");
    expect(typeof data.audioPath).toBe("string");
  });

  it("audioPath ends with .wav", async () => {
    const res = await POST(makeReq({ cameraId: "cam-1" }) as any);
    const data = await res.json();
    expect(data.audioPath).toMatch(/\.wav$/);
  });

  it("calls mkdir with recursive: true", async () => {
    await POST(makeReq({ cameraId: "cam-1" }) as any);
    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("calls writeFile to write WAV data", async () => {
    await POST(makeReq({ cameraId: "cam-1" }) as any);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("missing body uses default cameraId 'unknown'", async () => {
    const req = new Request("http://localhost/api/theft-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.audioPath).toContain("unknown");
  });

  it("cameraId is sanitized and included in audioPath", async () => {
    const res = await POST(makeReq({ cameraId: "cam-entrance-01" }) as any);
    const data = await res.json();
    expect(data.audioPath).toContain("cam-entrance-01");
  });

  it("returns customText in response when provided", async () => {
    const res = await POST(makeReq({ cameraId: "cam-1", customText: "Custom alert!" }) as any);
    const data = await res.json();
    expect(data.text).toBe("Custom alert!");
  });

  it("returns 500 when writeFile fails", async () => {
    mockWriteFile.mockRejectedValueOnce(new Error("Disk full"));
    const res = await POST(makeReq({ cameraId: "cam-1" }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
