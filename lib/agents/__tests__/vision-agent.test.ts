import { VisionAgent } from "@/lib/agents/vision-agent";
import type { IncidentInput } from "@/lib/agents/types";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
    analyzeImage: jest.fn(),
    textCompletion: jest.fn(),
  }),
}));

import { isGeminiConfigured, getGeminiClient } from "@/lib/gemini/client";

const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;
const mockGetClient = getGeminiClient as jest.MockedFunction<typeof getGeminiClient>;

function makeInput(overrides: Partial<IncidentInput> = {}): IncidentInput {
  return {
    incidentId: "inc-1",
    cameraId: "cam-1",
    location: "Aisle 3",
    timestamp: new Date("2024-01-01T12:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(false);
});

describe("VisionAgent.analyze() — YOLO-only path", () => {
  it("returns valid AgentAnalysis when Gemini not configured and no frameBase64", async () => {
    const agent = new VisionAgent();
    const result = await agent.analyze(makeInput());
    expect(result.agentId).toBe("vision_agent");
    expect(typeof result.isSuspicious).toBe("boolean");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.reasoning).toBe("string");
    expect(Array.isArray(result.evidencePoints)).toBe(true);
    expect(Array.isArray(result.falsePositiveRisks)).toBe(true);
  });

  it("YOLO-only with person + bag → isSuspicious true", async () => {
    const agent = new VisionAgent();
    const result = await agent.analyze(
      makeInput({
        visualData: {
          yoloDetections: [
            { class: "person", confidence: 0.9, bbox: { x1: 0, y1: 0, x2: 50, y2: 100 } },
            { class: "backpack", confidence: 0.85, bbox: { x1: 10, y1: 10, x2: 40, y2: 60 } },
          ],
        },
      })
    );
    expect(result.isSuspicious).toBe(true);
  });

  it("YOLO-only with no detections → isSuspicious false", async () => {
    const agent = new VisionAgent();
    const result = await agent.analyze(makeInput({ visualData: { yoloDetections: [] } }));
    expect(result.isSuspicious).toBe(false);
  });

  it("YOLO-only with only a person and no bag/product → isSuspicious false", async () => {
    const agent = new VisionAgent();
    const result = await agent.analyze(
      makeInput({
        visualData: {
          yoloDetections: [
            { class: "person", confidence: 0.9, bbox: { x1: 0, y1: 0, x2: 50, y2: 100 } },
          ],
        },
      })
    );
    expect(result.isSuspicious).toBe(false);
  });
});

describe("VisionAgent.analyze() — Gemini path", () => {
  it("calls gemini.analyzeImage() when configured and frameBase64 present", async () => {
    mockIsConfigured.mockReturnValue(true);
    const mockAnalyzeImage = jest.fn().mockResolvedValue(
      JSON.stringify({
        is_suspicious: true,
        confidence: 0.8,
        reasoning: "Suspicious behavior detected",
        evidence_points: ["concealing item"],
        false_positive_risks: [],
        recommended_action: "alert",
      })
    );
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage, textCompletion: jest.fn() } as any);

    const agent = new VisionAgent();
    const result = await agent.analyze(
      makeInput({ visualData: { frameBase64: "base64imagedata" } })
    );

    expect(mockAnalyzeImage).toHaveBeenCalled();
    expect(result.isSuspicious).toBe(true);
    expect(result.confidence).toBe(0.8);
  });

  it("parses valid JSON from Gemini into AgentAnalysis correctly", async () => {
    mockIsConfigured.mockReturnValue(true);
    const geminiResponse = JSON.stringify({
      is_suspicious: false,
      confidence: 0.3,
      reasoning: "Normal behavior",
      evidence_points: ["no suspicious items"],
      false_positive_risks: ["normal shopper"],
      recommended_action: "dismiss",
    });
    const mockAnalyzeImage = jest.fn().mockResolvedValue(geminiResponse);
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage, textCompletion: jest.fn() } as any);

    const agent = new VisionAgent();
    const result = await agent.analyze(
      makeInput({ visualData: { frameBase64: "img" } })
    );

    expect(result.isSuspicious).toBe(false);
    expect(result.confidence).toBe(0.3);
    expect(result.reasoning).toBe("Normal behavior");
    expect(result.recommendedAction).toBe("dismiss");
  });

  it("falls back to fallbackAnalysis on invalid JSON from Gemini", async () => {
    mockIsConfigured.mockReturnValue(true);
    const mockAnalyzeImage = jest.fn().mockResolvedValue("not valid json {{{");
    mockGetClient.mockReturnValue({ analyzeImage: mockAnalyzeImage, textCompletion: jest.fn() } as any);

    const agent = new VisionAgent();
    const result = await agent.analyze(
      makeInput({ visualData: { frameBase64: "img" } })
    );

    expect(result.agentId).toBe("vision_agent");
    expect(result.isSuspicious).toBe(false); // fallback
    expect(result.confidence).toBe(0.3);
  });
});

describe("VisionAgent.respond()", () => {
  it("returns a valid AgentMessage with content string when Gemini not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    const agent = new VisionAgent();
    const prevMessage = {
      id: "msg-1",
      agentId: "audio_agent" as const,
      timestamp: new Date(),
      content: "I heard something suspicious",
    };
    const context = {
      conversationId: "conv-1",
      incidentId: "inc-1",
      cameraId: "cam-1",
      location: "Aisle 3",
      startedAt: new Date(),
      messages: [prevMessage],
      status: "analyzing" as const,
    };
    const response = await agent.respond(prevMessage, context);
    expect(response.agentId).toBe("vision_agent");
    expect(typeof response.content).toBe("string");
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.replyTo).toBe("msg-1");
  });
});
