/**
 * Multi-Agent Conversation Types
 *
 * Defines the contract for agent communication, message passing,
 * and incident analysis workflow.
 */

export type AgentId = "audio_agent" | "vision_agent" | "coordinator";

export type AgentRole = "detective" | "analyst" | "arbiter";

export interface AgentMessage {
  id: string;
  agentId: AgentId;
  timestamp: Date;
  content: string;
  replyTo?: string;
  metadata?: {
    confidence?: number;
    evidenceType?: "audio" | "visual" | "combined";
    framePaths?: string[];
    audioPath?: string;
  };
}

export interface ConversationContext {
  conversationId: string;
  incidentId: string;
  cameraId: string;
  location: string;
  startedAt: Date;
  messages: AgentMessage[];
  status: "analyzing" | "concluded" | "escalated" | "dismissed";
}

export interface AgentAnalysis {
  agentId: AgentId;
  isSuspicious: boolean;
  confidence: number;
  reasoning: string;
  evidencePoints: string[];
  falsePositiveRisks: string[];
  recommendedAction: "dismiss" | "monitor" | "alert" | "escalate";
}

export interface ConversationConclusion {
  conversationId: string;
  incidentId: string;
  finalVerdict:
    | "confirmed_threat"
    | "false_positive"
    | "inconclusive"
    | "needs_human_review";
  combinedConfidence: number;
  summary: string;
  audioAgentAnalysis: AgentAnalysis;
  visionAgentAnalysis: AgentAnalysis;
  consensusReached: boolean;
  decidedAt: Date;
}

export interface IncidentInput {
  incidentId: string;
  cameraId: string;
  location: string;
  timestamp: Date;
  audioData?: {
    audioPath?: string;
    transcript?: string;
    rawAudioBase64?: string;
  };
  visualData?: {
    framePaths?: string[];
    frameBase64?: string;
    yoloDetections?: YoloDetection[];
  };
}

export interface YoloDetection {
  class: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

export interface AgentInterface {
  id: AgentId;
  role: AgentRole;
  name: string;
  analyze(
    input: IncidentInput,
    context?: AgentMessage[]
  ): Promise<AgentAnalysis>;
  respond(
    previousMessage: AgentMessage,
    context: ConversationContext
  ): Promise<AgentMessage>;
}
