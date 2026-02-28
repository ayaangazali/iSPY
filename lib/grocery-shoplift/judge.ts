/**
 * Concealment Judge — Local (default). No API key required.
 */

import type { JudgeResult, SuspicionResult } from "./types";

export interface ConcealmentJudgeInput {
  framePaths: string[];
  location: string;
  cameraId: string;
  suspicionScore: number;
  suspicionReasons: string[];
  exitWithoutCheckout: boolean;
  torsoRatioSpike: boolean;
}

export interface IConcealmentJudge {
  judge(input: ConcealmentJudgeInput): Promise<JudgeResult>;
}

/**
 * Local rule-based judge (default). No API key. Deterministic.
 */
export class LocalFallbackJudge implements IConcealmentJudge {
  async judge(input: ConcealmentJudgeInput): Promise<JudgeResult> {
    const concealment_likely =
      input.exitWithoutCheckout || input.torsoRatioSpike;
    const confidence_0_1 = concealment_likely ? 0.7 : 0.2;
    const evidence: string[] = [];
    if (input.exitWithoutCheckout) evidence.push("exit_without_checkout");
    if (input.torsoRatioSpike) evidence.push("torso_ratio_spike");
    return {
      concealment_likely,
      confidence_0_1,
      evidence,
      risk_of_false_positive: ["rule-based heuristic; no visual analysis"],
      recommended_action: concealment_likely && confidence_0_1 >= 0.7 ? "alert" : "log_only",
    };
  }
}

/**
 * Gemini VLM judge is available via getGeminiClient() from @/lib/gemini/client if needed.
 * To add vision-based judging, implement using getGeminiClient() from @/lib/gemini/client.
 */

let defaultJudge: IConcealmentJudge = new LocalFallbackJudge();

export function getConcealmentJudge(): IConcealmentJudge {
  return defaultJudge;
}

export async function initConcealmentJudge(): Promise<IConcealmentJudge> {
  defaultJudge = new LocalFallbackJudge();
  return defaultJudge;
}
