/**
 * MiniMax API Client
 *
 * Unified access to MiniMax APIs:
 * - M2.1 (abab7-chat-preview) for vision and reasoning
 * - Speech 2.6 (speech-02-hd) for speech-to-text
 * - TTS (speech-2.8-turbo) for text-to-speech
 *
 * Env: MINIMAX_API_KEY, MINIMAX_GROUP_ID
 */

export interface MiniMaxConfig {
  apiKey: string;
  groupId?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | MessageContent[];
}

export interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface SpeechToTextResponse {
  text: string;
  duration?: number;
}

export const MINIMAX_MODELS = {
  VISION_REASONING: "abab7-chat-preview", // M2.1 - Full vision + reasoning
  TEXT_LITE: "abab6.5s-chat", // Lighter model for text-only
  SPEECH_TO_TEXT: "speech-02-hd", // Speech 2.6 for STT
  TEXT_TO_SPEECH: "speech-2.8-turbo", // TTS model
} as const;

export const MINIMAX_ENDPOINTS = {
  CHAT: "https://api.minimax.chat/v1/text/chatcompletion_v2",
  SPEECH_TO_TEXT: "https://api.minimax.chat/v1/audio/speech_to_text",
  TEXT_TO_SPEECH: "https://api-uw.minimax.io/v1/t2a_v2",
} as const;

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

export class MiniMaxClient {
  private apiKey: string;
  private groupId: string;

  constructor(config?: Partial<MiniMaxConfig>) {
    const apiKey = config?.apiKey || process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error("MINIMAX_API_KEY environment variable is not set");
    }
    this.apiKey = apiKey;
    this.groupId = config?.groupId || process.env.MINIMAX_GROUP_ID || "";
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((r) => setTimeout(r, backoff));
      }

      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (response.ok) {
          return response;
        }

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const errorText = await response.text();
        throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const isRetryable =
          lastError.message.includes("429") ||
          lastError.message.includes("5") ||
          lastError.message.includes("timeout") ||
          lastError.message.includes("ETIMEDOUT");

        if (!isRetryable || attempt === retries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Request failed");
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const response = await this.fetchWithRetry(MINIMAX_ENDPOINTS.CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...request,
        stream: false,
      }),
    });

    return response.json();
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    systemPrompt?: string,
    options?: { maxTokens?: number; jsonResponse?: boolean }
  ): Promise<string> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageBase64 } },
      ],
    });

    const response = await this.chatCompletion({
      model: MINIMAX_MODELS.VISION_REASONING,
      messages,
      max_tokens: options?.maxTokens || 2000,
      response_format: options?.jsonResponse ? { type: "json_object" } : undefined,
    });

    return response.choices[0]?.message?.content || "";
  }

  async textCompletion(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number; jsonResponse?: boolean }
  ): Promise<string> {
    const response = await this.chatCompletion({
      model: MINIMAX_MODELS.TEXT_LITE,
      messages,
      max_tokens: options?.maxTokens || 500,
      temperature: options?.temperature,
      response_format: options?.jsonResponse ? { type: "json_object" } : undefined,
    });

    return response.choices[0]?.message?.content || "";
  }

  async speechToText(audioBase64: string): Promise<string> {
    const response = await this.fetchWithRetry(MINIMAX_ENDPOINTS.SPEECH_TO_TEXT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MINIMAX_MODELS.SPEECH_TO_TEXT,
        audio: audioBase64,
        language: "en",
      }),
    });

    const data: SpeechToTextResponse = await response.json();
    return data.text || "";
  }

  async prefilterImage(imageBase64: string, prompt: string): Promise<boolean> {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ];

    const response = await this.chatCompletion({
      model: MINIMAX_MODELS.TEXT_LITE,
      messages,
      max_tokens: 10,
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || "";
    return answer.startsWith("YES");
  }
}

let clientInstance: MiniMaxClient | null = null;

export function getMiniMaxClient(): MiniMaxClient {
  if (!clientInstance) {
    clientInstance = new MiniMaxClient();
  }
  return clientInstance;
}

export function isMiniMaxConfigured(): boolean {
  return !!process.env.MINIMAX_API_KEY;
}

export function resetMiniMaxClient(): void {
  clientInstance = null;
}
