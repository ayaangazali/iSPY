import { POST } from "@/app/api/analyze/route";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn(),
}));

import { isGeminiConfigured } from "@/lib/gemini/client";

const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;

function makeReq(body: object) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/analyze — not configured", () => {
  it("returns 500 when Gemini not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    const res = await POST(makeReq({ videoUrl: "http://example.com/video.mp4" }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

describe("POST /api/analyze — configured", () => {
  beforeEach(() => {
    mockIsConfigured.mockReturnValue(true);
  });

  it("returns an array of timestamps", async () => {
    const res = await POST(makeReq({ videoUrl: "http://example.com/video.mp4" }) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  }, 10000);

  it("each item has timestamp and description fields", async () => {
    const res = await POST(makeReq({ videoUrl: "http://example.com/video.mp4" }) as any);
    const data = await res.json();
    for (const item of data) {
      expect(item).toHaveProperty("timestamp");
      expect(item).toHaveProperty("description");
      expect(typeof item.timestamp).toBe("string");
      expect(typeof item.description).toBe("string");
    }
  }, 10000);

  it("handles missing videoUrl gracefully", async () => {
    const res = await POST(makeReq({}) as any);
    // Route doesn't validate videoUrl, so it should still return data
    expect(res.status).toBe(200);
  }, 10000);
});
