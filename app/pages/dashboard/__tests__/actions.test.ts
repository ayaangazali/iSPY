import { detectEvents } from "@/app/pages/dashboard/actions";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
    analyzeImage: jest.fn().mockResolvedValue(
      JSON.stringify({
        events: [
          { timestamp: "00:05", description: "Person picking up item", isDangerous: true },
        ],
      })
    ),
  }),
}));

import { isGeminiConfigured, getGeminiClient } from "@/lib/gemini/client";

const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;
const mockGetClient = getGeminiClient as jest.MockedFunction<typeof getGeminiClient>;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
});

describe("detectEvents() — dashboard actions", () => {
  it("returns { events, rawResponse } for valid base64 image", async () => {
    const result = await detectEvents("base64imagedata");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("rawResponse");
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("throws when no image data provided", async () => {
    await expect(detectEvents("")).rejects.toThrow("No image data provided");
  });

  it("throws when GEMINI_API_KEY not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    await expect(detectEvents("base64data")).rejects.toThrow("GEMINI_API_KEY");
  });

  it("transcript is passed to Gemini prompt", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue(JSON.stringify({ events: [] }));
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    await detectEvents("base64imagedata", "person said steal the item");

    const promptArg = mockAnalyzeImage.mock.calls[0][1];
    expect(promptArg).toContain("steal the item");
  });

  it("transcript is not included when empty", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue(JSON.stringify({ events: [] }));
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    await detectEvents("base64imagedata", "");

    const promptArg = mockAnalyzeImage.mock.calls[0][1];
    expect(promptArg).not.toContain("Audio transcript:");
  });

  it("returns valid parsed VideoEvent array", async () => {
    // Set mock explicitly to avoid pollution from preceding tests
    const mockAnalyzeImage = jest.fn().mockResolvedValue(
      JSON.stringify({ events: [{ timestamp: "00:05", description: "Person picking up item", isDangerous: true }] })
    );
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64imagedata");
    expect(result.events.length).toBeGreaterThan(0);
    const event = result.events[0];
    expect(event).toHaveProperty("timestamp");
    expect(event).toHaveProperty("description");
    expect(event).toHaveProperty("isDangerous");
  });
});

describe("detectEvents() — malformed response", () => {
  it("returns empty events on malformed JSON response", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("not valid json");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });

  it("returns empty events when response has no events key", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue(JSON.stringify({ other: "data" }));
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });

  it("handles empty Gemini response gracefully", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });

  it("handles Gemini refusal message gracefully", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("I cannot analyze this content.");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });
});
