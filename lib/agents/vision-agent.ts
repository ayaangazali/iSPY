/**
 * Vision Agent - "Analyst Morgan"
 *
 * Personality: Methodical analyst, focuses on visual evidence and material detection.
 * Uses YOLO for object detection and Gemini for reasoning about behavior.
 *
 * Role: Analyze visual frames for:
 * - Object detection (bags, merchandise, concealment)
 * - Body language and positioning
 * - Material handling patterns
 * - Zone violations
 */

import { getGeminiClient, isGeminiConfigured } from "@/lib/gemini/client";
import type {
  AgentInterface,
  AgentId,
  AgentRole,
  IncidentInput,
  AgentAnalysis,
  AgentMessage,
  ConversationContext,
  YoloDetection,
} from "./types";
import {
  VISION_AGENT_SYSTEM_PROMPT,
  VISION_AGENT_ANALYSIS_PROMPT,
} from "./prompts";

export class VisionAgent implements AgentInterface {
  id: AgentId = "vision_agent";
  role: AgentRole = "analyst";
  name = "Analyst Morgan";

  async analyze(
    input: IncidentInput,
    _context?: AgentMessage[]
  ): Promise<AgentAnalysis> {
    const yoloSummary = input.visualData?.yoloDetections?.length
      ? this.formatYoloDetections(input.visualData.yoloDetections)
      : "No object detection data available.";

    // If we have frame data and Gemini is configured, analyze with vision
    if (input.visualData?.frameBase64 && isGeminiConfigured()) {
      try {
        const gemini = getGeminiClient();
        const prompt = VISION_AGENT_ANALYSIS_PROMPT.replace(
          "{YOLO_DETECTIONS}",
          yoloSummary
        )
          .replace("{LOCATION}", input.location)
          .replace("{TIMESTAMP}", input.timestamp.toISOString());

        const response = await gemini.analyzeImage(
          input.visualData.frameBase64,
          prompt,
          VISION_AGENT_SYSTEM_PROMPT,
          { maxTokens: 1000, jsonResponse: true }
        );

        try {
          const analysis = JSON.parse(response);
          return {
            agentId: this.id,
            isSuspicious: analysis.is_suspicious ?? false,
            confidence: analysis.confidence ?? 0.5,
            reasoning: analysis.reasoning ?? "Visual analysis complete.",
            evidencePoints: analysis.evidence_points ?? [],
            falsePositiveRisks: analysis.false_positive_risks ?? [],
            recommendedAction: this.mapAction(analysis.recommended_action),
          };
        } catch {
          return this.fallbackAnalysis(yoloSummary);
        }
      } catch (error) {
        console.error("[VisionAgent] Analysis error:", error);
        return this.fallbackAnalysis(yoloSummary);
      }
    }

    // YOLO-only analysis without frame or without Gemini
    return this.analyzeYoloOnly(input.visualData?.yoloDetections ?? []);
  }

  private formatYoloDetections(detections: YoloDetection[]): string {
    if (detections.length === 0) return "No objects detected.";

    return detections
      .map(
        (d) =>
          `- ${d.class} (${(d.confidence * 100).toFixed(1)}% confidence) at position [${d.bbox.x1.toFixed(0)}, ${d.bbox.y1.toFixed(0)}]`
      )
      .join("\n");
  }

  private analyzeYoloOnly(detections: YoloDetection[]): AgentAnalysis {
    const personCount = detections.filter((d) => d.class === "person").length;
    const bagCount = detections.filter((d) =>
      ["backpack", "handbag", "suitcase", "bag"].includes(d.class.toLowerCase())
    ).length;
    const productCount = detections.filter((d) =>
      ["bottle", "box", "package", "food", "fruit"].includes(
        d.class.toLowerCase()
      )
    ).length;

    const isSuspicious =
      personCount > 0 && (bagCount > 0 || productCount > 0) && personCount < 3;

    const evidencePoints: string[] = [];
    if (personCount > 0) evidencePoints.push(`${personCount} person(s) detected`);
    if (bagCount > 0) evidencePoints.push(`${bagCount} bag(s) detected`);
    if (productCount > 0)
      evidencePoints.push(`${productCount} product(s) detected`);

    return {
      agentId: this.id,
      isSuspicious,
      confidence: 0.4,
      reasoning: `YOLO detected ${personCount} person(s), ${bagCount} bag(s), and ${productCount} product(s). Basic pattern analysis only.`,
      evidencePoints,
      falsePositiveRisks: [
        "Limited to YOLO detection only - no behavioral analysis",
      ],
      recommendedAction: isSuspicious ? "monitor" : "dismiss",
    };
  }

  private fallbackAnalysis(yoloSummary: string): AgentAnalysis {
    return {
      agentId: this.id,
      isSuspicious: false,
      confidence: 0.3,
      reasoning: `Visual analysis fallback. YOLO summary: ${yoloSummary}`,
      evidencePoints: [],
      falsePositiveRisks: ["Analysis parsing failed"],
      recommendedAction: "monitor",
    };
  }

  async respond(
    previousMessage: AgentMessage,
    context: ConversationContext
  ): Promise<AgentMessage> {
    if (!isGeminiConfigured()) {
      return {
        id: `msg-${Date.now()}-vision`,
        agentId: this.id,
        timestamp: new Date(),
        content: `I've considered the audio analysis. My visual observations ${
          previousMessage.metadata?.confidence &&
          previousMessage.metadata.confidence > 0.6
            ? "support the concerns raised"
            : "don't show definitive suspicious behavior"
        }. I recommend we continue monitoring.`,
        replyTo: previousMessage.id,
      };
    }

    try {
      const gemini = getGeminiClient();
      const conversationHistory = context.messages
        .map((m) => `[${m.agentId}]: ${m.content}`)
        .join("\n");

      const prompt = `You are Analyst Morgan, a methodical visual evidence specialist.
The Audio Agent (Detective Cole) just said: "${previousMessage.content}"

Previous conversation:
${conversationHistory}

Incident context:
- Location: ${context.location}
- Camera: ${context.cameraId}

Respond with your visual analysis perspective. Be precise and evidence-based.
Reference specific visual observations. Address any audio concerns raised.
Keep response under 100 words.`;

      const response = await gemini.textCompletion([
        { role: "system", content: VISION_AGENT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);

      return {
        id: `msg-${Date.now()}-vision`,
        agentId: this.id,
        timestamp: new Date(),
        content: response,
        replyTo: previousMessage.id,
      };
    } catch {
      return {
        id: `msg-${Date.now()}-vision`,
        agentId: this.id,
        timestamp: new Date(),
        content:
          "I acknowledge the audio findings. My visual assessment aligns with the overall analysis.",
        replyTo: previousMessage.id,
      };
    }
  }

  private mapAction(action?: string): AgentAnalysis["recommendedAction"] {
    const mapping: Record<string, AgentAnalysis["recommendedAction"]> = {
      dismiss: "dismiss",
      monitor: "monitor",
      alert: "alert",
      escalate: "escalate",
    };
    return mapping[action?.toLowerCase() ?? ""] ?? "monitor";
  }
}
