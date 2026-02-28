"use server";

import {
  getGeminiClient,
  isGeminiConfigured,
} from "@/lib/gemini/client";

export interface VideoEvent {
  timestamp: string;
  description: string;
  isDangerous: boolean;
}

export async function detectEvents(
  base64Image: string,
  transcript: string = ""
): Promise<{ events: VideoEvent[]; rawResponse: string }> {
  console.log("Starting frame analysis...");
  try {
    if (!base64Image) {
      throw new Error("No image data provided");
    }

    if (!isGeminiConfigured()) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    const gemini = getGeminiClient();

    console.log("Sending image to Gemini API...");
    const prompt = `Analyze this security camera frame.

**INCIDENT RULE — ONLY FLAG WHEN THERE IS PROOF:**
- Having a bag or carrying items is OK. Do NOT flag "person holding a bag" or "carrying items" by itself.
- ONLY create an incident (isDangerous: true) when you see proof of:
  1) **Placing something INTO a bag, pocket, or under clothing** — describe as "Placing [item/object] into bag" or "Placing item into pocket/clothing." Say what is being placed only if clearly visible (e.g. "Placing item into bag"); do NOT name the specific product (no "oranges" or "mandarins").
  2) **Visible concealment** — bulge under shirt/jacket, item being hidden in clothing. Describe as "Possible concealment under clothing" or "Placing item under clothing."

If the person only has a bag or is only carrying items and is NOT placing anything into the bag/clothing, do NOT add an event with isDangerous: true.

**1. Retail / placing into bag (only flag if proof of placing into bag/clothing):**
- Is the person actively placing or putting an item into a bag, pocket, or under clothing? → isDangerous: true, description: "Placing item into bag" or "Placing item into pocket" (add what is being placed only if clearly visible; use "item" or "object," not product names).
- Visible concealment under clothing? → isDangerous: true.

**2. Medical:** Unconscious, clutching chest, seizures, choking → isDangerous: true.

**3. Falls/Injuries:** Falling, on ground, bleeding → isDangerous: true.

**4. Distress:** Calling for help, fainting → isDangerous: true.

**5. Violence/Threats:** Altercation, weapons → isDangerous: true.

**6. Other:** Vandalism, trespassing → isDangerous: true.
${transcript ? `Consider this audio transcript: "${transcript}"\n` : ""}
Return ONLY valid JSON in this format:

{
    "events": [
        {
            "timestamp": "mm:ss",
            "description": "e.g. Placing item into bag — only for proof of placing into bag/clothing; do not accuse for just having a bag",
            "isDangerous": true
        }
    ]
}
Remember: isDangerous true ONLY for placing into bag/clothing (with proof), concealment under clothing, medical, falls, violence, or other dangerous behavior. NOT for simply holding a bag or carrying items.`;

    const systemPrompt =
      "You are a security camera analysis system. You MUST respond ONLY with valid JSON in the exact format specified. Never respond with explanatory text, apologies, or refusals. If you cannot analyze the image, return an empty events array.";

    try {
      const text = await gemini.analyzeImage(base64Image, prompt, systemPrompt, {
        maxTokens: 1000,
        jsonResponse: true,
      });

      console.log("Raw API Response:", text);

      if (!text || text.trim().length === 0) {
        console.log("Empty response from API, returning empty events");
        return {
          events: [],
          rawResponse: "No content in API response",
        };
      }

      if (
        text.includes("I'm sorry") ||
        text.includes("I cannot") ||
        text.includes("I can't")
      ) {
        console.log("API refused to process image, returning empty events");
        return {
          events: [],
          rawResponse: "No events detected in this frame",
        };
      }

      let jsonStr = text.trim();
      const codeBlockMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else if (!jsonStr.startsWith("{")) {
        const jsonMatch = text.match(/\{[^]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        } else {
          return { events: [], rawResponse: text };
        }
      }

      if (!jsonStr || jsonStr.trim().length === 0) {
        return { events: [], rawResponse: text };
      }

      try {
        const parsed = JSON.parse(jsonStr);
        return {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          rawResponse: text,
        };
      } catch {
        return { events: [], rawResponse: text || "Failed to analyze frame" };
      }
    } catch (error) {
      console.error("Error calling API:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in detectEvents:", error);
    throw error;
  }
}
