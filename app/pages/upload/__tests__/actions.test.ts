import { detectEvents } from "@/app/pages/upload/actions";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
    analyzeImage: jest.fn().mockResolvedValue(
      JSON.stringify({ events: [{ timestamp: "00:01", description: "Person near shelf", isDangerous: true }] })
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

describe("detectEvents() — input validation", () => {
  it("throws when no image data provided", async () => {
    await expect(detectEvents("")).rejects.toThrow("No image data provided");
  });

  it("throws when GEMINI_API_KEY not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    await expect(detectEvents("base64data")).rejects.toThrow("GEMINI_API_KEY");
  });
});

describe("detectEvents() — valid input", () => {
  it("returns { events, rawResponse } structure", async () => {
    const result = await detectEvents("base64imagedata");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("rawResponse");
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("events have isDangerous, timestamp, description fields", async () => {
    const result = await detectEvents("base64imagedata");
    for (const event of result.events) {
      expect(event).toHaveProperty("isDangerous");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("description");
    }
  });

  it("calls gemini.analyzeImage with base64 data", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue(
      JSON.stringify({ events: [] })
    );
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    await detectEvents("mybase64data");
    expect(mockAnalyzeImage).toHaveBeenCalledWith(
      "mybase64data",
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    );
  });
});

describe("detectEvents() — JSON parse errors", () => {
  it("returns empty events array when Gemini returns invalid JSON", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("this is not json at all");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
    expect(result.rawResponse).toBe("this is not json at all");
  });

  it("returns empty events when response is empty", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });

  it("returns empty events array when events key is missing from response", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue(JSON.stringify({ other: "data" }));
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });
});

describe("detectEvents() — refusal handling", () => {
  it("returns empty events when Gemini refuses with 'I'm sorry'", async () => {
    const mockAnalyzeImage = jest.fn().mockResolvedValue("I'm sorry, I cannot analyze this image.");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage } as any);

    const result = await detectEvents("base64data");
    expect(result.events).toEqual([]);
  });
});
