/**
 * Voice Alert — Local only (beep or OS TTS). No API key required.
 */

import { spawn } from "child_process";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const DEFAULT_TEMPLATE = "Security alert. Possible shoplifting detected at {location}.";

function getAlertText(location: string): string {
  const t = process.env.SHOPLIFT_ALERT_TEMPLATE ?? DEFAULT_TEMPLATE;
  return t.replace(/\{location\}/g, location);
}

export interface VoiceAlertResult {
  success: boolean;
  audioPath?: string;
  voiceUsed: "local" | "gemini";
  error?: string;
}

export interface IVoiceAlert {
  play(location: string, cameraId: string): Promise<VoiceAlertResult>;
}

/**
 * Local beep: write WAV to ./alerts/audio/ and play with afplay/ffplay.
 * Non-blocking. No API key.
 */
async function writeBeepWav(dir: string, fileName: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  const sampleRate = 8000;
  const durationSec = 0.4;
  const freq = 880;
  const numSamples = sampleRate * durationSec;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  let offset = 0;
  const write = (str: string) => { buffer.write(str, offset); offset += str.length; };
  const writeU32 = (n: number) => { buffer.writeUInt32LE(n, offset); offset += 4; };
  const writeU16 = (n: number) => { buffer.writeUInt16LE(n, offset); offset += 2; };
  write("RIFF");
  writeU32(36 + numSamples * 2);
  write("WAVE");
  write("fmt ");
  writeU32(16);
  writeU16(1);
  writeU16(1);
  writeU32(sampleRate);
  writeU32(sampleRate * 2);
  writeU16(2);
  writeU16(16);
  write("data");
  writeU32(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    buffer.writeInt16LE(Math.floor(32767 * 0.3 * Math.sin(2 * Math.PI * freq * t)), offset);
    offset += 2;
  }
  await writeFile(fullPath, buffer);
  return fullPath;
}

function playNonBlocking(audioPath: string): void {
  const cmd = process.platform === "darwin" ? "afplay" : "ffplay";
  const args = process.platform === "darwin" ? [audioPath] : ["-nodisp", "-autoexit", "-loglevel", "quiet", audioPath];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}

/**
 * Local voice: beep (default) or OS TTS (say on macOS, espeak on Linux if available).
 * Non-blocking. No API key.
 */
export class LocalVoiceAlert implements IVoiceAlert {
  async play(location: string, cameraId: string): Promise<VoiceAlertResult> {
    const text = getAlertText(location);
    const dir = path.join(process.cwd(), "alerts", "audio");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeCam = cameraId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 24);

    try {
      if (process.platform === "darwin") {
        const wavPath = path.join(dir, `${ts}_${safeCam}_local.wav`);
        await mkdir(dir, { recursive: true });
        await new Promise<void>((resolve, reject) => {
          const child = spawn("say", ["-o", wavPath, text], { stdio: "ignore" });
          child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`say exited ${code}`))));
          child.on("error", reject);
        });
        playNonBlocking(wavPath);
        return { success: true, audioPath: wavPath, voiceUsed: "local" };
      }
      if (process.platform === "linux") {
        try {
          const wavPath = path.join(dir, `${ts}_${safeCam}_local.wav`);
          await mkdir(dir, { recursive: true });
          await new Promise<void>((resolve, reject) => {
            const child = spawn("espeak", ["-w", wavPath, text], { stdio: "ignore" });
            child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`espeak exited ${code}`))));
            child.on("error", reject);
          });
          playNonBlocking(wavPath);
          return { success: true, audioPath: wavPath, voiceUsed: "local" };
        } catch {
          // fall through to beep
        }
      }
      const beepPath = await writeBeepWav(dir, `${ts}_${safeCam}_beep.wav`);
      playNonBlocking(beepPath);
      return { success: true, audioPath: beepPath, voiceUsed: "local" };
    } catch (e) {
      const beepPath = await writeBeepWav(dir, `${ts}_${safeCam}_beep.wav`);
      playNonBlocking(beepPath);
      return { success: true, audioPath: beepPath, voiceUsed: "local", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

let defaultVoice: IVoiceAlert = new LocalVoiceAlert();

export function getVoiceAlert(): IVoiceAlert {
  return defaultVoice;
}

export async function initVoiceAlert(): Promise<IVoiceAlert> {
  defaultVoice = new LocalVoiceAlert();
  return defaultVoice;
}
