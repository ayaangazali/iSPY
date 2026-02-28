/**
 * Grocery Store Theft Detection - Detection Service
 *
 * Server actions and client utilities for theft detection.
 * Uses Gemini for vision analysis.
 */

"use server";

import {
  getGeminiClient,
  isGeminiConfigured,
  GEMINI_MODELS,
} from "@/lib/gemini/client";
import type {
  TheftEvent,
  TheftBehaviorType,
  Zone,
  TheftDetectionResponse,
  SeverityLevel,
} from "./types";
import {
  RETAIL_THEFT_SYSTEM_PROMPT,
  generateRetailTheftPrompt,
  PREFILTER_PROMPT,
} from "./prompts";
import {
  calculateSuspicionScore,
  getSeverityFromScore,
  AdditionalFactors,
} from "./scoring";
import {
  findZonesContainingPoint,
  calculateRiskMultiplier,
  isInZoneType,
} from "./zones";
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_BEHAVIOR_WEIGHTS,
  DEFAULT_CALIBRATION,
  SAMPLE_GROCERY_ZONES,
} from "./config";

interface DetectionOptions {
  cameraId?: string;
  storeId?: string;
  zones?: Zone[];
  usePreFilter?: boolean;
  previousContext?: string;
}

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

/**
 * Detect theft/suspicious behavior in a frame
 * This is a server action that can be called directly from client components
 */
export async function detectGroceryTheft(
  imageBase64: string,
  options: DetectionOptions = {}
): Promise<TheftDetectionResponse> {
  const startTime = Date.now();

  const {
    cameraId = "unknown",
    storeId = "default-store",
    zones = SAMPLE_GROCERY_ZONES,
    usePreFilter = false,
    previousContext,
  } = options;

  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const gemini = getGeminiClient();

  // Optional pre-filter
  if (usePreFilter) {
    const shouldAnalyze = await runPreFilter(imageBase64);
    if (!shouldAnalyze) {
      return {
        events: [],
        personTracks: [],
        analysisTimeMs: Date.now() - startTime,
        modelUsed: `${GEMINI_MODELS.TEXT} (pre-filter)`,
        frameAnalyzed: false,
      };
    }
  }

  // Full VLM analysis
  console.log("[Grocery Detection] Starting Gemini analysis...");
  const vlmResult = await runFullAnalysis(imageBase64, zones, previousContext);

  if (!vlmResult) {
    return {
      events: [],
      personTracks: [],
      analysisTimeMs: Date.now() - startTime,
      modelUsed: GEMINI_MODELS.VISION_REASONING,
      frameAnalyzed: true,
    };
  }

  console.log(
    "[Grocery Detection] Gemini returned",
    vlmResult.events.length,
    "events"
  );

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
      timestamp: new Date(),
      cameraId,
      storeId,
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

  // Filter out low-score events
  const significantEvents = events.filter(
    (e) => e.suspicionScore >= DEFAULT_THRESHOLDS.logOnly
  );

  return {
    events: significantEvents,
    personTracks: [],
    analysisTimeMs: Date.now() - startTime,
    modelUsed: GEMINI_MODELS.VISION_REASONING,
    frameAnalyzed: true,
  };
}

async function runPreFilter(imageBase64: string): Promise<boolean> {
  try {
    const gemini = getGeminiClient();
    return await gemini.prefilterImage(imageBase64, PREFILTER_PROMPT);
  } catch (error) {
    console.error("[Grocery Detection] Pre-filter error:", error);
    return true;
  }
}

async function runFullAnalysis(
  imageBase64: string,
  zones: Zone[],
  previousContext?: string
): Promise<VLMAnalysisResult | null> {
  const prompt = generateRetailTheftPrompt(zones, previousContext);

  try {
    const gemini = getGeminiClient();
    const text = await gemini.analyzeImage(
      imageBase64,
      prompt,
      RETAIL_THEFT_SYSTEM_PROMPT,
      { maxTokens: 2000, jsonResponse: true }
    );

    if (!text) return null;

    try {
      return JSON.parse(text) as VLMAnalysisResult;
    } catch {
      const match = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
      if (match) {
        return JSON.parse(match[1]) as VLMAnalysisResult;
      }
      return null;
    }
  } catch (error) {
    console.error("[Grocery Detection] VLM analysis error:", error);
    return null;
  }
}

/**
 * Simplified detection for quick checks
 * Returns just the essential info
 */
export async function quickDetect(imageBase64: string): Promise<{
  hasSuspiciousActivity: boolean;
  highestScore: number;
  topEvent: string | null;
}> {
  try {
    const result = await detectGroceryTheft(imageBase64, { usePreFilter: true });

    if (result.events.length === 0) {
      return { hasSuspiciousActivity: false, highestScore: 0, topEvent: null };
    }

    const highestScoreEvent = result.events.reduce(
      (max, e) => (e.suspicionScore > max.suspicionScore ? e : max),
      result.events[0]
    );

    return {
      hasSuspiciousActivity:
        highestScoreEvent.suspicionScore >= DEFAULT_THRESHOLDS.dashboardMark,
      highestScore: highestScoreEvent.suspicionScore,
      topEvent: highestScoreEvent.description,
    };
  } catch (error) {
    console.error("[Quick Detect] Error:", error);
    return { hasSuspiciousActivity: false, highestScore: 0, topEvent: null };
  }
}
