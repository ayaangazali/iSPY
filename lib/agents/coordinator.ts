/**
 * Agent Coordinator
 *
 * Orchestrates multi-turn conversations between Audio and Vision agents.
 * Manages conversation flow, determines consensus, and logs to database.
 */

import { AudioAgent } from "./audio-agent";
import { VisionAgent } from "./vision-agent";
import { getConversationDatabase } from "./conversation-db";
import { getGeminiClient, isGeminiConfigured } from "@/lib/gemini/client";
import { COORDINATOR_CONSENSUS_PROMPT } from "./prompts";
import type {
  IncidentInput,
  ConversationContext,
  ConversationConclusion,
  AgentMessage,
  AgentAnalysis,
} from "./types";

const MAX_CONVERSATION_TURNS = 4;
const CONSENSUS_THRESHOLD = 0.7;

export class AgentCoordinator {
  private audioAgent: AudioAgent;
  private visionAgent: VisionAgent;

  constructor() {
    this.audioAgent = new AudioAgent();
    this.visionAgent = new VisionAgent();
  }

  async analyzeIncident(input: IncidentInput): Promise<ConversationConclusion> {
    const db = getConversationDatabase();
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const context: ConversationContext = {
      conversationId,
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      location: input.location,
      startedAt: new Date(),
      messages: [],
      status: "analyzing",
    };

    // Save initial conversation
    db.saveConversation(context);

    // Phase 1: Initial independent analysis
    const [audioAnalysis, visionAnalysis] = await Promise.all([
      this.audioAgent.analyze(input),
      this.visionAgent.analyze(input),
    ]);

    // Log initial analyses as messages
    const audioInitial: AgentMessage = {
      id: `msg-${Date.now()}-audio-init`,
      agentId: "audio_agent",
      timestamp: new Date(),
      content: `Initial Analysis: ${audioAnalysis.reasoning}\n\nEvidence: ${audioAnalysis.evidencePoints.join(", ") || "None"}\n\nConfidence: ${(audioAnalysis.confidence * 100).toFixed(0)}%\n\nRecommendation: ${audioAnalysis.recommendedAction}`,
      metadata: { confidence: audioAnalysis.confidence, evidenceType: "audio" },
    };

    const visionInitial: AgentMessage = {
      id: `msg-${Date.now()}-vision-init`,
      agentId: "vision_agent",
      timestamp: new Date(),
      content: `Initial Analysis: ${visionAnalysis.reasoning}\n\nEvidence: ${visionAnalysis.evidencePoints.join(", ") || "None"}\n\nConfidence: ${(visionAnalysis.confidence * 100).toFixed(0)}%\n\nRecommendation: ${visionAnalysis.recommendedAction}`,
      metadata: {
        confidence: visionAnalysis.confidence,
        evidenceType: "visual",
      },
    };

    context.messages.push(audioInitial, visionInitial);
    db.saveMessage(context.conversationId, audioInitial);
    db.saveMessage(context.conversationId, visionInitial);

    // Phase 2: Multi-turn conversation if not in immediate agreement
    if (this.needsDiscussion(audioAnalysis, visionAnalysis)) {
      await this.runConversation(context, db);
    }

    // Phase 3: Reach conclusion
    const conclusion = await this.determineConclusion(
      context,
      audioAnalysis,
      visionAnalysis
    );

    db.saveConclusion(conclusion);

    return conclusion;
  }

  private needsDiscussion(
    audio: AgentAnalysis,
    vision: AgentAnalysis
  ): boolean {
    if (audio.isSuspicious !== vision.isSuspicious) return true;
    if (
      audio.confidence < CONSENSUS_THRESHOLD &&
      vision.confidence < CONSENSUS_THRESHOLD
    )
      return true;
    if (audio.recommendedAction !== vision.recommendedAction) return true;
    return false;
  }

  private async runConversation(
    context: ConversationContext,
    db: ReturnType<typeof getConversationDatabase>
  ): Promise<void> {
    let currentSpeaker = this.visionAgent;
    let respondingAgent = this.audioAgent;
    let lastMessage = context.messages[context.messages.length - 1];

    for (let turn = 0; turn < MAX_CONVERSATION_TURNS; turn++) {
      const response = await respondingAgent.respond(lastMessage, context);
      context.messages.push(response);
      db.saveMessage(context.conversationId, response);

      if (
        response.content.toLowerCase().includes("i agree") ||
        response.content.toLowerCase().includes("consensus")
      ) {
        break;
      }

      [currentSpeaker, respondingAgent] = [respondingAgent, currentSpeaker];
      lastMessage = response;
    }
  }

  private async determineConclusion(
    context: ConversationContext,
    audioAnalysis: AgentAnalysis,
    visionAnalysis: AgentAnalysis
  ): Promise<ConversationConclusion> {
    if (!isGeminiConfigured()) {
      return this.localConclusion(context, audioAnalysis, visionAnalysis);
    }

    try {
      const gemini = getGeminiClient();
      const conversationText = context.messages
        .map((m) => `[${m.agentId}]: ${m.content}`)
        .join("\n\n");

      const prompt = COORDINATOR_CONSENSUS_PROMPT.replace(
        "{AUDIO_ANALYSIS}",
        JSON.stringify(audioAnalysis, null, 2)
      )
        .replace("{VISION_ANALYSIS}", JSON.stringify(visionAnalysis, null, 2))
        .replace("{CONVERSATION}", conversationText);

      const response = await gemini.textCompletion(
        [
          {
            role: "system",
            content: "You are an impartial security arbiter.",
          },
          { role: "user", content: prompt },
        ],
        { maxTokens: 500, jsonResponse: true }
      );

      try {
        const decision = JSON.parse(response);
        return {
          conversationId: context.conversationId,
          incidentId: context.incidentId,
          finalVerdict: decision.final_verdict ?? "inconclusive",
          combinedConfidence: decision.combined_confidence ?? 0.5,
          summary: decision.summary ?? "Analysis complete.",
          audioAgentAnalysis: audioAnalysis,
          visionAgentAnalysis: visionAnalysis,
          consensusReached: decision.consensus_reached ?? false,
          decidedAt: new Date(),
        };
      } catch {
        return this.localConclusion(context, audioAnalysis, visionAnalysis);
      }
    } catch {
      return this.localConclusion(context, audioAnalysis, visionAnalysis);
    }
  }

  private localConclusion(
    context: ConversationContext,
    audioAnalysis: AgentAnalysis,
    visionAnalysis: AgentAnalysis
  ): ConversationConclusion {
    const avgConfidence =
      (audioAnalysis.confidence + visionAnalysis.confidence) / 2;
    const bothSuspicious =
      audioAnalysis.isSuspicious && visionAnalysis.isSuspicious;
    const eitherSuspicious =
      audioAnalysis.isSuspicious || visionAnalysis.isSuspicious;

    let finalVerdict: ConversationConclusion["finalVerdict"];
    if (bothSuspicious && avgConfidence >= 0.6) {
      finalVerdict = "confirmed_threat";
    } else if (!eitherSuspicious) {
      finalVerdict = "false_positive";
    } else if (avgConfidence < 0.4) {
      finalVerdict = "inconclusive";
    } else {
      finalVerdict = "needs_human_review";
    }

    return {
      conversationId: context.conversationId,
      incidentId: context.incidentId,
      finalVerdict,
      combinedConfidence: avgConfidence,
      summary: `Local determination based on ${bothSuspicious ? "agreement" : "disagreement"} between agents. Audio confidence: ${(audioAnalysis.confidence * 100).toFixed(0)}%, Vision confidence: ${(visionAnalysis.confidence * 100).toFixed(0)}%.`,
      audioAgentAnalysis: audioAnalysis,
      visionAgentAnalysis: visionAnalysis,
      consensusReached: audioAnalysis.isSuspicious === visionAnalysis.isSuspicious,
      decidedAt: new Date(),
    };
  }
}

let coordinatorInstance: AgentCoordinator | null = null;

export function getAgentCoordinator(): AgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new AgentCoordinator();
  }
  return coordinatorInstance;
}
