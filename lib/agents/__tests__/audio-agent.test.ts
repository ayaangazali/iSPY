import { AudioAgent } from "@/lib/agents/audio-agent";
import type { IncidentInput } from "@/lib/agents/types";

jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn().mockReturnValue({
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
    location: "Entrance",
    timestamp: new Date("2024-01-01T12:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(false);
});

describe("AudioAgent.analyze() — no audio", () => {
  it("returns isSuspicious: false and recommendedAction: 'dismiss' with no transcript or audio", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(makeInput());
    expect(result.isSuspicious).toBe(false);
    expect(result.recommendedAction).toBe("dismiss");
    expect(result.agentId).toBe("audio_agent");
  });

  it("returns isSuspicious: false for empty transcript", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(makeInput({ audioData: { transcript: "" } }));
    expect(result.isSuspicious).toBe(false);
  });

  it("returns isSuspicious: false for whitespace-only transcript", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(makeInput({ audioData: { transcript: "   " } }));
    expect(result.isSuspicious).toBe(false);
  });
});

describe("AudioAgent.analyze() — local analysis", () => {
  it("returns isSuspicious: true with >= 2 suspicious keywords", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "let's grab it and pocket it fast" } })
    );
    expect(result.isSuspicious).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns isSuspicious: false with only 1 suspicious keyword", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "just going to grab one thing" } })
    );
    // "grab" is only 1 keyword
    // Actually "grab" appears once - let's check the logic: foundPatterns.length >= 2
    // "grab" = 1, isSuspicious should be false
    expect(result.isSuspicious).toBe(false);
  });

  it("returns isSuspicious: false with no suspicious keywords", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "I would like to buy some apples" } })
    );
    expect(result.isSuspicious).toBe(false);
  });

  it("includes found keywords in evidencePoints", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "steal and hide this quick" } })
    );
    expect(result.evidencePoints.length).toBeGreaterThan(0);
    expect(result.evidencePoints.some((p) => p.includes("steal") || p.includes("hide"))).toBe(true);
  });

  it("returns valid AgentAnalysis shape for local analysis", async () => {
    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "some text" } })
    );
    expect(result).toHaveProperty("agentId");
    expect(result).toHaveProperty("isSuspicious");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("evidencePoints");
    expect(result).toHaveProperty("falsePositiveRisks");
    expect(result).toHaveProperty("recommendedAction");
  });
});

describe("AudioAgent.analyze() — Gemini path", () => {
  it("calls textCompletion when Gemini is configured", async () => {
    mockIsConfigured.mockReturnValue(true);
    const mockTextCompletion = jest.fn().mockResolvedValue(
      JSON.stringify({
        is_suspicious: true,
        confidence: 0.75,
        reasoning: "Suspicious conversation detected",
        evidence_points: ["theft keyword"],
        false_positive_risks: [],
        recommended_action: "monitor",
      })
    );
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "let's steal and hide" } })
    );

    expect(mockTextCompletion).toHaveBeenCalled();
    expect(result.isSuspicious).toBe(true);
    expect(result.confidence).toBe(0.75);
  });

  it("falls back to local analysis on invalid JSON from Gemini", async () => {
    mockIsConfigured.mockReturnValue(true);
    const mockTextCompletion = jest.fn().mockResolvedValue("not json at all");
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const agent = new AudioAgent();
    // Use a transcript with 2+ keywords to make local analysis return isSuspicious: true
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "steal and pocket it" } })
    );

    expect(result.agentId).toBe("audio_agent");
    // Fallback to local: "steal" + "pocket" = 2 keywords → isSuspicious: true
    expect(result.isSuspicious).toBe(true);
  });

  it("falls back to local analysis when Gemini throws", async () => {
    mockIsConfigured.mockReturnValue(true);
    const mockTextCompletion = jest.fn().mockRejectedValue(new Error("API error"));
    mockGetClient.mockReturnValue({ textCompletion: mockTextCompletion } as any);

    const agent = new AudioAgent();
    const result = await agent.analyze(
      makeInput({ audioData: { transcript: "normal shopping" } })
    );

    expect(result.agentId).toBe("audio_agent");
    expect(result.isSuspicious).toBe(false);
  });
});

describe("AudioAgent.respond()", () => {
  it("returns a valid AgentMessage with content when Gemini not configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    const agent = new AudioAgent();
    const prevMessage = {
      id: "msg-1",
      agentId: "vision_agent" as const,
      timestamp: new Date(),
      content: "I see suspicious behavior",
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
    expect(response.agentId).toBe("audio_agent");
    expect(typeof response.content).toBe("string");
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.replyTo).toBe("msg-1");
  });
});
