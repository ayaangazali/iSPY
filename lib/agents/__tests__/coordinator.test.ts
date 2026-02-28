import { AgentCoordinator, getAgentCoordinator } from "@/lib/agents/coordinator";
import type { IncidentInput } from "@/lib/agents/types";

jest.mock("@/lib/agents/audio-agent");
jest.mock("@/lib/agents/vision-agent");
// Provide factory to prevent Jest from loading the real module (which needs better-sqlite3)
jest.mock("@/lib/agents/conversation-db", () => ({
  getConversationDatabase: jest.fn(),
}));
jest.mock("@/lib/gemini/client", () => ({
  isGeminiConfigured: jest.fn().mockReturnValue(false),
  getGeminiClient: jest.fn(),
}));

import { AudioAgent } from "@/lib/agents/audio-agent";
import { VisionAgent } from "@/lib/agents/vision-agent";
import { getConversationDatabase } from "@/lib/agents/conversation-db";
import { isGeminiConfigured } from "@/lib/gemini/client";

const MockAudioAgent = AudioAgent as jest.MockedClass<typeof AudioAgent>;
const MockVisionAgent = VisionAgent as jest.MockedClass<typeof VisionAgent>;
const mockGetConversationDatabase = getConversationDatabase as jest.MockedFunction<typeof getConversationDatabase>;
const mockIsConfigured = isGeminiConfigured as jest.MockedFunction<typeof isGeminiConfigured>;

const mockDb = {
  saveConversation: jest.fn(),
  saveMessage: jest.fn(),
  saveConclusion: jest.fn(),
  getConversation: jest.fn(),
  getMessages: jest.fn().mockReturnValue([]),
};

function makeInput(overrides: Partial<IncidentInput> = {}): IncidentInput {
  return {
    incidentId: "inc-test",
    cameraId: "cam-1",
    location: "Aisle 5",
    timestamp: new Date("2024-01-01T12:00:00Z"),
    ...overrides,
  };
}

function makeAnalysis(isSuspicious: boolean, confidence: number) {
  return {
    agentId: "audio_agent" as const,
    isSuspicious,
    confidence,
    reasoning: "test reasoning",
    evidencePoints: [],
    falsePositiveRisks: [],
    recommendedAction: (isSuspicious ? "monitor" : "dismiss") as "monitor" | "dismiss",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(false);
  mockGetConversationDatabase.mockReturnValue(mockDb as any);

  // Default: both non-suspicious with low confidence
  MockAudioAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(false, 0.2));
  MockVisionAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(false, 0.2));
  MockAudioAgent.prototype.respond = jest.fn().mockResolvedValue({
    id: "msg-audio",
    agentId: "audio_agent",
    timestamp: new Date(),
    content: "I agree with the assessment",
  });
  MockVisionAgent.prototype.respond = jest.fn().mockResolvedValue({
    id: "msg-vision",
    agentId: "vision_agent",
    timestamp: new Date(),
    content: "I agree with the assessment",
  });
});

describe("AgentCoordinator.analyzeIncident() — verdicts", () => {
  it("both non-suspicious → finalVerdict is 'false_positive'", async () => {
    MockAudioAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(false, 0.2));
    MockVisionAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(false, 0.2));

    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput());

    expect(result.finalVerdict).toBe("false_positive");
  });

  it("both suspicious with high confidence → finalVerdict is 'confirmed_threat'", async () => {
    MockAudioAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(true, 0.85));
    MockVisionAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(true, 0.9));

    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput());

    expect(result.finalVerdict).toBe("confirmed_threat");
  });

  it("agents disagree → triggers conversation (respond is called)", async () => {
    // Disagree: one suspicious, one not
    MockAudioAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(true, 0.7));
    MockVisionAgent.prototype.analyze = jest.fn().mockResolvedValue(makeAnalysis(false, 0.4));

    const coordinator = new AgentCoordinator();
    await coordinator.analyzeIncident(makeInput());

    // When agents disagree, respond should be called
    const respondCalls =
      (MockAudioAgent.prototype.respond as jest.Mock).mock.calls.length +
      (MockVisionAgent.prototype.respond as jest.Mock).mock.calls.length;
    expect(respondCalls).toBeGreaterThan(0);
  });
});

describe("AgentCoordinator.analyzeIncident() — conclusion structure", () => {
  it("ConversationConclusion has all required fields", async () => {
    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput());

    expect(result).toHaveProperty("conversationId");
    expect(result).toHaveProperty("incidentId");
    expect(result).toHaveProperty("finalVerdict");
    expect(result).toHaveProperty("combinedConfidence");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("audioAgentAnalysis");
    expect(result).toHaveProperty("visionAgentAnalysis");
    expect(result).toHaveProperty("consensusReached");
    expect(result).toHaveProperty("decidedAt");
  });

  it("incidentId matches the input incidentId", async () => {
    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput({ incidentId: "my-incident" }));
    expect(result.incidentId).toBe("my-incident");
  });

  it("combinedConfidence is between 0 and 1", async () => {
    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput());
    expect(result.combinedConfidence).toBeGreaterThanOrEqual(0);
    expect(result.combinedConfidence).toBeLessThanOrEqual(1);
  });

  it("summary is a non-empty string", async () => {
    const coordinator = new AgentCoordinator();
    const result = await coordinator.analyzeIncident(makeInput());
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe("getAgentCoordinator() singleton", () => {
  it("returns an AgentCoordinator instance", () => {
    const coordinator = getAgentCoordinator();
    expect(coordinator).toBeInstanceOf(AgentCoordinator);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getAgentCoordinator();
    const b = getAgentCoordinator();
    expect(a).toBe(b);
  });
});

describe("AgentCoordinator.analyzeIncident() — db interactions", () => {
  it("saves conversation and conclusion to the database", async () => {
    const coordinator = new AgentCoordinator();
    await coordinator.analyzeIncident(makeInput());

    expect(mockDb.saveConversation).toHaveBeenCalled();
    expect(mockDb.saveConclusion).toHaveBeenCalled();
  });
});
