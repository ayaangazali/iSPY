/**
 * Multi-Agent Analysis API
 *
 * POST /api/agents/analyze
 *
 * Triggers multi-agent conversation system to analyze an incident.
 * Audio Agent (Detective Cole) and Vision Agent (Analyst Morgan) converse
 * to reach consensus on whether activity is suspicious.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAgentCoordinator } from "@/lib/agents/coordinator";
import { getConversationDatabase } from "@/lib/agents/conversation-db";
import type { IncidentInput, YoloDetection } from "@/lib/agents/types";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      incidentId,
      cameraId,
      location,
      timestamp,
      audioTranscript,
      audioBase64,
      frameBase64,
      yoloDetections,
    } = body;

    if (!incidentId || !cameraId || !location) {
      return NextResponse.json(
        { error: "incidentId, cameraId, and location are required" },
        { status: 400 }
      );
    }

    const input: IncidentInput = {
      incidentId,
      cameraId,
      location,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      audioData: {
        transcript: audioTranscript,
        rawAudioBase64: audioBase64,
      },
      visualData: {
        frameBase64,
        yoloDetections: yoloDetections as YoloDetection[],
      },
    };

    const coordinator = getAgentCoordinator();
    const conclusion = await coordinator.analyzeIncident(input);

    return NextResponse.json({
      success: true,
      conclusion,
      analysisTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("Agent analysis error:", error);
    return NextResponse.json(
      {
        error: error.message || "Analysis failed",
        analysisTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = getConversationDatabase();
    const stats = db.getStatistics();
    const recent = db.getRecentConversations(10);

    return NextResponse.json({
      name: "Multi-Agent Analysis API",
      version: "1.0.0",
      agents: {
        audio: {
          name: "Detective Cole",
          role: "Audio forensics specialist",
          model: "MiniMax Speech 2.6 + M2.1",
        },
        vision: {
          name: "Analyst Morgan",
          role: "Visual evidence specialist",
          model: "YOLO + MiniMax M2.1",
        },
      },
      statistics: stats,
      recentConversations: recent.map((c) => ({
        id: c.conversationId,
        incidentId: c.incidentId,
        cameraId: c.cameraId,
        location: c.location,
        status: c.status,
        startedAt: c.startedAt,
        messageCount: c.messages.length,
      })),
      endpoints: {
        "POST /api/agents/analyze": {
          description: "Analyze an incident with multi-agent conversation",
          body: {
            incidentId: "Unique incident identifier (required)",
            cameraId: "Camera identifier (required)",
            location: "Location description (required)",
            timestamp: "ISO timestamp (optional)",
            audioTranscript: "Transcript of audio (optional)",
            audioBase64: "Base64 audio for transcription (optional)",
            frameBase64: "Base64 frame for vision analysis (optional)",
            yoloDetections: "YOLO detection results (optional)",
          },
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to get statistics" },
      { status: 500 }
    );
  }
}
