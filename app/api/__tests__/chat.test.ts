import { POST } from "@/app/api/chat/route";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
    textCompletion: jest.fn().mockResolvedValue("Here is my response"),
  }),
}));

import { isGeminiConfigured, getGeminiClient } from "@/lib/gemini/client";

const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;
const mockGetClient = getGeminiClient as jest.MockedFunction<typeof getGeminiClient>;

function makeReq(body: object) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/chat — not configured", () => {
  it("returns 500 when GEMINI_API_KEY not set", async () => {
    mockIsConfigured.mockReturnValue(false);
    const res = await POST(makeReq({ messages: [], events: [] }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

describe("POST /api/chat — configured", () => {
  beforeEach(() => {
    mockIsConfigured.mockReturnValue(true);
  });

  it("valid request with events calls textCompletion and returns role:assistant", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("security alert summary");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const res = await POST(
      makeReq({
        messages: [{ role: "user", content: "What happened?" }],
        events: [{ timestamp: "00:03", description: "Person near exit", isDangerous: true }],
      }) as any
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe("security alert summary");
    expect(data.role).toBe("assistant");
    expect(mockTextCompletion).toHaveBeenCalled();
  });

  it("empty events array uses fallback context message", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("no events detected response");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    await POST(makeReq({ messages: [], events: [] }) as any);

    const callArgs = mockTextCompletion.mock.calls[0];
    const systemMessage = callArgs[0][0];
    expect(systemMessage.content).toContain("No events");
  });

  it("events with isDangerous: true are included in system message", async () => {
    const mockTextCompletion = jest.fn().mockResolvedValue("response");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    await POST(
      makeReq({
        messages: [],
        events: [{ timestamp: "01:00", description: "Theft detected", isDangerous: true }],
      }) as any
    );

    const systemMessage = mockTextCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain("Dangerous");
  });

  it("Gemini throws → returns 500", async () => {
    const mockTextCompletion = jest.fn().mockRejectedValue(new Error("Gemini unavailable"));
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const res = await POST(makeReq({ messages: [], events: [] }) as any);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
