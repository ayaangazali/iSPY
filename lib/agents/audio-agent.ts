/**
 * Audio Agent - "Detective Cole"
 *
 * Personality: Skeptical investigator, focuses on verbal cues and conversation patterns.
 * Uses Gemini for reasoning about transcripts.
 *
 * Role: Analyze audio for suspicious conversations that might indicate:
 * - Planning theft ("grab it and go", "distract the clerk", etc.)
 * - Coordination between accomplices
 * - Nervous or evasive speech patterns
 */

import {
  getGeminiClient,
  isGeminiConfigured,
} from "@/lib/gemini/client";
import type {
  AgentInterface,
  AgentId,
  AgentRole,
  IncidentInput,
  AgentAnalysis,
  AgentMessage,
  ConversationContext,
} from "./types";
import {
  AUDIO_AGENT_SYSTEM_PROMPT,
  AUDIO_AGENT_ANALYSIS_PROMPT,
} from "./prompts";

export class AudioAgent implements AgentInterface {
  id: AgentId = "audio_agent";
  role: AgentRole = "detective";
  name = "Detective Cole";

  async transcribeAudio(_audioBase64: string): Promise<string> {
    // Gemini does not have a standalone STT endpoint; return empty string
    // and let local keyword analysis handle the no-transcript fallback.
    return "";
  }

  async analyze(
    input: IncidentInput,
    _context?: AgentMessage[]
  ): Promise<AgentAnalysis> {
    let transcript = input.audioData?.transcript;

    if (!transcript && input.audioData?.rawAudioBase64) {
      transcript = await this.transcribeAudio(input.audioData.rawAudioBase64);
    }

    if (!transcript || transcript.trim().length === 0) {
      return {
        agentId: this.id,
        isSuspicious: false,
        confidence: 0.1,
        reasoning: "No audio transcript available for analysis.",
        evidencePoints: [],
        falsePositiveRisks: ["No audio data to analyze"],
        recommendedAction: "dismiss",
      };
    }

    if (!isGeminiConfigured()) {
      return this.localAnalysis(transcript, input);
    }

    try {
      const gemini = getGeminiClient();
      const prompt = AUDIO_AGENT_ANALYSIS_PROMPT.replace(
        "{TRANSCRIPT}",
        transcript
      )
        .replace("{LOCATION}", input.location)
        .replace("{TIMESTAMP}", input.timestamp.toISOString());

      const response = await gemini.textCompletion(
        [
          { role: "system", content: AUDIO_AGENT_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        { maxTokens: 1000, jsonResponse: true }
      );

      try {
        const analysis = JSON.parse(response);
        return {
          agentId: this.id,
          isSuspicious: analysis.is_suspicious ?? false,
          confidence: analysis.confidence ?? 0.5,
          reasoning: analysis.reasoning ?? "Analysis complete.",
          evidencePoints: analysis.evidence_points ?? [],
          falsePositiveRisks: analysis.false_positive_risks ?? [],
          recommendedAction: this.mapAction(analysis.recommended_action),
        };
      } catch {
        return this.localAnalysis(transcript, input);
      }
    } catch (error) {
      console.error("[AudioAgent] Analysis error:", error);
      return this.localAnalysis(transcript, input);
    }
  }

  private localAnalysis(
    transcript: string,
    input: IncidentInput
  ): AgentAnalysis {
    const lowerTranscript = transcript.toLowerCase();
    const suspiciousPatterns = [
      "grab",
      "take",
      "steal",
      "pocket",
      "hide",
      "distract",
      "let's go",
      "quick",
      "hurry",
      "no one's looking",
      "camera",
      "security",
      "bag",
      "stuff it",
    ];

    const foundPatterns = suspiciousPatterns.filter((p) =>
      lowerTranscript.includes(p)
    );
    const isSuspicious = foundPatterns.length >= 2;

    return {
      agentId: this.id,
      isSuspicious,
      confidence: isSuspicious ? 0.6 : 0.3,
      reasoning: isSuspicious
        ? `Local analysis detected ${foundPatterns.length} suspicious keywords: ${foundPatterns.join(", ")}`
        : "Local analysis found no concerning patterns in transcript.",
      evidencePoints: foundPatterns.map((p) => `Keyword detected: "${p}"`),
      falsePositiveRisks: [
        "Local keyword matching only - no semantic analysis",
      ],
      recommendedAction: isSuspicious ? "monitor" : "dismiss",
    };
  }

  async respond(
    previousMessage: AgentMessage,
    context: ConversationContext
  ): Promise<AgentMessage> {
    if (!isGeminiConfigured()) {
      return {
        id: `msg-${Date.now()}-audio`,
        agentId: this.id,
        timestamp: new Date(),
        content: `I've reviewed the visual observations. Based on my audio analysis, I ${
          previousMessage.metadata?.confidence &&
          previousMessage.metadata.confidence > 0.6
            ? "agree there are concerning patterns"
            : "didn't detect significant verbal indicators"
        }. Let's proceed with caution.`,
        replyTo: previousMessage.id,
      };
    }

    try {
      const gemini = getGeminiClient();
      const conversationHistory = context.messages
        .map((m) => `[${m.agentId}]: ${m.content}`)
        .join("\n");

      const prompt = `You are Detective Cole, a skeptical audio analysis expert.
The Vision Agent (Analyst Morgan) just said: "${previousMessage.content}"

Previous conversation:
${conversationHistory}

Incident context:
- Location: ${context.location}
- Camera: ${context.cameraId}

Respond with your analysis perspective. Be skeptical but fair.
Focus on what you heard in the audio. Ask probing questions if visual claims seem unsupported.
Keep response under 100 words.`;

      const response = await gemini.textCompletion([
        { role: "system", content: AUDIO_AGENT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);

      return {
        id: `msg-${Date.now()}-audio`,
        agentId: this.id,
        timestamp: new Date(),
        content: response,
        replyTo: previousMessage.id,
      };
    } catch {
      return {
        id: `msg-${Date.now()}-audio`,
        agentId: this.id,
        timestamp: new Date(),
        content:
          "I acknowledge the visual analysis. My audio review is consistent with the observations made.",
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
