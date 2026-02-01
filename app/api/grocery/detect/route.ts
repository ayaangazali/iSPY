/**
 * Grocery Store Theft Detection API
 *
 * POST /api/grocery/detect
 *
 * Hybrid detection pipeline using MiniMax M2.1:
 * 1. Optional pre-filter (lightweight check if VLM analysis is needed)
 * 2. Full VLM analysis with grocery-specific prompts
 * 3. Scoring with zone multipliers
 * 4. Event creation and response
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMiniMaxClient,
  isMiniMaxConfigured,
  MINIMAX_MODELS,
} from "@/lib/minimax/client";
import {
  TheftEvent,
  TheftBehaviorType,
  Zone,
  TheftDetectionResponse,
  SeverityLevel,
} from "@/lib/grocery/types";
import {
  RETAIL_THEFT_SYSTEM_PROMPT,
  generateRetailTheftPrompt,
  PREFILTER_PROMPT,
} from "@/lib/grocery/prompts";
import {
  calculateSuspicionScore,
  getSeverityFromScore,
  AdditionalFactors,
} from "@/lib/grocery/scoring";
import {
  findZonesContainingPoint,
  calculateRiskMultiplier,
  isInZoneType,
} from "@/lib/grocery/zones";
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_BEHAVIOR_WEIGHTS,
  DEFAULT_CALIBRATION,
  SAMPLE_GROCERY_ZONES,
} from "@/lib/grocery/config";

interface VLMAnalysisResult {
  frame_analysis: {
    people_detected: number;
    items_visible: string[];
    zones_occupied: string[];
  };
  events: Array<{
    behavior_type: TheftBehaviorType;
    suspicion_score: number;
    severity: SeverityLevel;
    zone: string | null;
    description: string;
    reasoning: string;
    person_location: { x: number; y: number };
    confidence: number;
  }>;
  overall_risk: "none" | "low" | "medium" | "high";
  recommended_action: "none" | "monitor" | "alert" | "dispatch";
}

async function shouldAnalyze(imageBase64: string): Promise<boolean> {
  try {
    const minimax = getMiniMaxClient();
    return await minimax.prefilterImage(imageBase64, PREFILTER_PROMPT);
  } catch (error) {
    console.error("Pre-filter error, proceeding with analysis:", error);
    return true;
  }
}

async function analyzeFrame(
  imageBase64: string,
  zones: Zone[],
  previousContext?: string
): Promise<VLMAnalysisResult | null> {
  const prompt = generateRetailTheftPrompt(zones, previousContext);

  try {
    const minimax = getMiniMaxClient();
    const text = await minimax.analyzeImage(
      imageBase64,
      prompt,
      RETAIL_THEFT_SYSTEM_PROMPT,
      { maxTokens: 2000, jsonResponse: true }
    );

    if (!text) {
      console.error("Empty response from VLM");
      return null;
    }

    try {
      return JSON.parse(text) as VLMAnalysisResult;
    } catch {
      const jsonMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as VLMAnalysisResult;
        } catch {
          return null;
        }
      }
      return null;
    }
  } catch (error) {
    console.error("VLM analysis error:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      imageBase64,
      cameraId,
      storeId,
      timestamp,
      zones = SAMPLE_GROCERY_ZONES,
      usePreFilter = false,
      previousContext,
    } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    if (!isMiniMaxConfigured()) {
      return NextResponse.json(
        { error: "MiniMax API key not configured" },
        { status: 500 }
      );
    }

    // Optional pre-filter
    if (usePreFilter) {
      const shouldDoFullAnalysis = await shouldAnalyze(imageBase64);
      if (!shouldDoFullAnalysis) {
        return NextResponse.json({
          events: [],
          personTracks: [],
          analysisTimeMs: Date.now() - startTime,
          modelUsed: `${MINIMAX_MODELS.TEXT_LITE} (pre-filter)`,
          frameAnalyzed: false,
        } as TheftDetectionResponse);
      }
    }

    // Full VLM analysis
    const vlmResult = await analyzeFrame(imageBase64, zones, previousContext);

    if (!vlmResult) {
      return NextResponse.json({
        events: [],
        personTracks: [],
        analysisTimeMs: Date.now() - startTime,
        modelUsed: MINIMAX_MODELS.VISION_REASONING,
        frameAnalyzed: true,
        error: "Analysis failed to produce results",
      });
    }

    // Process VLM results into TheftEvents
    const events: TheftEvent[] = vlmResult.events.map((vlmEvent, index) => {
      const personPosition = vlmEvent.person_location;
      const containingZones = findZonesContainingPoint(personPosition, zones);
      const primaryZone = containingZones[0] || null;
      const riskMultiplier = calculateRiskMultiplier(personPosition, zones);

      const additionalFactors: AdditionalFactors = {
        nearExit: isInZoneType(personPosition, zones, "exit"),
        modelConfidence: vlmEvent.confidence,
      };

      const finalScore = calculateSuspicionScore(
        vlmEvent.behavior_type,
        riskMultiplier,
        DEFAULT_CALIBRATION,
        DEFAULT_BEHAVIOR_WEIGHTS,
        additionalFactors
      );

      const finalSeverity = getSeverityFromScore(finalScore, DEFAULT_THRESHOLDS);

      return {
        id: `evt-${Date.now()}-${index}`,
        timestamp: new Date(timestamp || Date.now()),
        cameraId: cameraId || "unknown",
        storeId: storeId || "default-store",
        zoneId: primaryZone?.id,
        behaviorType: vlmEvent.behavior_type,
        suspicionScore: finalScore,
        severity: finalSeverity,
        description: vlmEvent.description,
        reasoning: vlmEvent.reasoning,
        keyframes: [],
        alertSent: false,
      } as TheftEvent;
    });

    const significantEvents = events.filter(
      (e) => e.suspicionScore >= DEFAULT_THRESHOLDS.logOnly
    );

    // Emit shoplifting voice alerts for events above alert threshold
    const { fromTheftEvent } = await import("@/lib/shoplift-alerts/types");
    const { runShopliftAlertPipeline } = await import(
      "@/lib/shoplift-alerts/pipeline"
    );
    for (const ev of significantEvents) {
      if (ev.suspicionScore >= DEFAULT_THRESHOLDS.alertSecurity) {
        const zone = zones.find((z: Zone) => z.id === ev.zoneId);
        const shopliftEvent = fromTheftEvent(
          { ...ev, keyframes: ev.keyframes },
          zone?.name
        );
        runShopliftAlertPipeline(shopliftEvent).catch((err) =>
          console.error("[Grocery detect] shoplift pipeline error:", err)
        );
      }
    }

    const response: TheftDetectionResponse = {
      events: significantEvents,
      personTracks: [],
      analysisTimeMs: Date.now() - startTime,
      modelUsed: MINIMAX_MODELS.VISION_REASONING,
      frameAnalyzed: true,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Grocery detection error:", error);
    return NextResponse.json(
      {
        error: error.message || "Detection failed",
        analysisTimeMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "Grocery Store Theft Detection API",
    version: "2.0.0",
    model: "MiniMax M2.1 (abab7-chat-preview)",
    endpoints: {
      "POST /api/grocery/detect": {
        description: "Analyze a frame for theft/suspicious behavior",
        body: {
          imageBase64: "Base64 encoded image (required)",
          cameraId: "Camera identifier",
          storeId: "Store identifier",
          timestamp: "ISO timestamp",
          zones: "Array of zone definitions (optional, uses defaults)",
          usePreFilter: "Use cheap pre-filter to reduce costs (optional)",
          previousContext: "Context from previous frames (optional)",
        },
        response: {
          events: "Array of detected TheftEvents",
          personTracks: "Array of person tracking data",
          analysisTimeMs: "Time taken for analysis",
          modelUsed: "VLM model used",
          frameAnalyzed: "Whether full analysis was performed",
        },
      },
    },
    thresholds: DEFAULT_THRESHOLDS,
  });
}
