/**
 * Gemini API Client
 *
 * Unified access to Google Gemini APIs.
 * Env: GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_MODELS = {
  VISION_REASONING: "gemini-1.5-flash",
  TEXT: "gemini-1.5-flash",
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class GeminiClient {
  private genai: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set");
    this.genai = new GoogleGenerativeAI(apiKey);
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    systemPrompt?: string,
    options?: { maxTokens?: number; jsonResponse?: boolean }
  ): Promise<string> {
    const model = this.genai.getGenerativeModel({
      model: GEMINI_MODELS.VISION_REASONING,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 2000,
        ...(options?.jsonResponse ? { responseMimeType: "application/json" as const } : {}),
      },
    });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imagePart = {
      inlineData: { data: base64Data, mimeType: "image/jpeg" as const },
    };

    const result = await model.generateContent([prompt, imagePart]);
    return result.response.text();
  }

  async textCompletion(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number; jsonResponse?: boolean }
  ): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const model = this.genai.getGenerativeModel({
      model: GEMINI_MODELS.TEXT,
      ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 500,
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.jsonResponse ? { responseMimeType: "application/json" as const } : {}),
      },
    });

    if (nonSystem.length === 0) return "";

    if (nonSystem.length === 1) {
      const result = await model.generateContent(nonSystem[0].content);
      return result.response.text();
    }

    const history = nonSystem.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const last = nonSystem[nonSystem.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.content);
    return result.response.text();
  }

  async prefilterImage(imageBase64: string, prompt: string): Promise<boolean> {
    const model = this.genai.getGenerativeModel({
      model: GEMINI_MODELS.VISION_REASONING,
      generationConfig: { maxOutputTokens: 10 },
    });
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imagePart = {
      inlineData: { data: base64Data, mimeType: "image/jpeg" as const },
    };
    const result = await model.generateContent([prompt, imagePart]);
    return result.response.text().trim().toUpperCase().startsWith("YES");
  }
}

let clientInstance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!clientInstance) clientInstance = new GeminiClient();
  return clientInstance;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function resetGeminiClient(): void {
  clientInstance = null;
}
