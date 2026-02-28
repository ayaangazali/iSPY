/**
 * Shoplifting Alert Pipeline — Gate → Voice → Playback → Log
 *
 * Voice: LOCAL by default (beep or OS TTS). No external TTS service.
 * No unhandled exceptions; safe defaults.
 */

import type { ShopliftingEvent } from "./types";
import { alertGate } from "./alert-gate";
import { logTriggered, logSuppressed } from "./incident-log";

export interface PipelineResult {
  triggered: boolean;
  reason?: string;
  audioPath?: string;
  fallbackUsed?: boolean;
}

/**
 * Process one ShopliftingEvent: gate → voice (local) → playback → log.
 * Uses local voice (beep or say/espeak).
 */
export async function runShopliftAlertPipeline(
  event: ShopliftingEvent
): Promise<PipelineResult> {
  try {
    const gateResult = alertGate(event);

    if (!gateResult.allowed) {
      await logSuppressed(event, gateResult.reason).catch((e) =>
        console.error("[ShopliftPipeline] logSuppressed error:", e)
      );
      return {
        triggered: false,
        reason: gateResult.reason,
      };
    }

    const alertText = `Security alert. Possible shoplifting detected at ${event.location}.`;
    let audioPath: string | undefined;
    let fallbackUsed = true;

    {
      const { getVoiceAlert } = await import("@/lib/grocery-shoplift/voice");
      const voice = getVoiceAlert();
      const result = await voice.play(event.location, event.camera_id);
      audioPath = result.audioPath;
      fallbackUsed = result.voiceUsed === "local";
    }

    if (!audioPath) {
      await logSuppressed(event, "voice_failed").catch((e) =>
        console.error("[ShopliftPipeline] logSuppressed error:", e)
      );
      return {
        triggered: false,
        reason: "voice_failed",
      };
    }

    await logTriggered(
      event,
      alertText,
      audioPath,
      undefined
    ).catch((e) => console.error("[ShopliftPipeline] logTriggered error:", e));

    const { playAudioNonBlocking } = await import("./playback");
    playAudioNonBlocking(audioPath).catch((e) =>
      console.error("[ShopliftPipeline] playback error:", e)
    );

    return {
      triggered: true,
      audioPath,
      fallbackUsed,
    };
  } catch (e) {
    console.error("[ShopliftPipeline] unexpected error:", e);
    await logSuppressed(
      event,
      e instanceof Error ? e.message : "pipeline_error"
    ).catch(() => {});
    return {
      triggered: false,
      reason: "pipeline_error",
    };
  }
}
