import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Theft voice alert — generates a local fallback beep audio file.
 * TTS uses local fallback beep; use VAPI or another TTS service for production alerts.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cameraId = (body?.cameraId as string) || "unknown";
    const customText = (body?.customText as string) || "THEFT detected";

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeCamera = cameraId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 32);
    const alertsDir = path.join(process.cwd(), "alerts", "audio");
    const wavPath = path.join(alertsDir, `${ts}_theft_${safeCamera}_beep.wav`);

    await mkdir(alertsDir, { recursive: true });
    await writeFallbackBeep(wavPath);

    return NextResponse.json({
      success: true,
      audioPath: wavPath,
      voiceUsed: "local",
      text: customText,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate alert audio" },
      { status: 500 }
    );
  }
}

async function writeFallbackBeep(wavPath: string): Promise<void> {
  const sampleRate = 8000;
  const durationSec = 0.3;
  const freq = 880;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(44 + numSamples * 2);
  let offset = 0;
  const write = (str: string) => { buffer.write(str, offset); offset += str.length; };
  const writeU32 = (n: number) => { buffer.writeUInt32LE(n, offset); offset += 4; };
  const writeU16 = (n: number) => { buffer.writeUInt16LE(n, offset); offset += 2; };
  write("RIFF"); writeU32(36 + numSamples * 2); write("WAVE");
  write("fmt "); writeU32(16); writeU16(1); writeU16(1);
  writeU32(sampleRate); writeU32(sampleRate * 2); writeU16(2); writeU16(16);
  write("data"); writeU32(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor(32767 * 0.3 * Math.sin(2 * Math.PI * freq * (i / sampleRate)));
    buffer.writeInt16LE(sample, offset); offset += 2;
  }
  await writeFile(wavPath, buffer);
}
