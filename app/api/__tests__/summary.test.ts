import { POST } from "@/app/api/summary/route";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
    textCompletion: jest.fn().mockResolvedValue("summary text"),
  }),
}));

import { isGeminiConfigured, getGeminiClient } from "@/lib/gemini/client";

const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;
const mockGetClient = getGeminiClient as jest.MockedFunction<typeof getGeminiClient>;

function makeReq(body: object) {
  return new Request("http://localhost/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/summary — not configured", () => {
  it("returns 500 when Gemini not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    const res = await POST(makeReq({ keyMoments: [] }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

describe("POST /api/summary — configured", () => {
  beforeEach(() => {
    mockIsConfigured.mockReturnValue(true);
  });

  it("valid keyMoments → calls textCompletion and returns { summary }", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("This is a comprehensive summary.");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const res = await POST(
      makeReq({
        keyMoments: [
          { videoName: "video1.mp4", timestamp: "00:30", description: "Person near exit", isDangerous: false },
        ],
      }) as any
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("This is a comprehensive summary.");
    expect(mockTextCompletion).toHaveBeenCalled();
  });

  it("formats keyMoments into prompt for Gemini", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("summary");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    await POST(
      makeReq({
        keyMoments: [
          { videoName: "test.mp4", timestamp: "00:10", description: "Suspicious behavior", isDangerous: true },
        ],
      }) as any
    );

    const messages = mockTextCompletion.mock.calls[0][0];
    const userMessage = messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("test.mp4");
    expect(userMessage.content).toContain("Suspicious behavior");
  });

  it("empty/whitespace response from Gemini → returns fallback message", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("   ");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const res = await POST(makeReq({ keyMoments: [] }) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toContain("No summary");
  });

  it("Gemini throws → returns 500", async () => {
    const mockTextCompletion = jest.fn().mockRejectedValue(new Error("API error"));
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const res = await POST(makeReq({ keyMoments: [] }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
