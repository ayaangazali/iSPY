"use server";

import {
  getMiniMaxClient,
  isMiniMaxConfigured,
} from "@/lib/minimax/client";

export interface VideoEvent {
  isDangerous: boolean;
  timestamp: string;
  description: string;
}

export async function detectEvents(
  base64Image: string
): Promise<{ events: VideoEvent[]; rawResponse: string }> {
  console.log("Starting frame analysis...");
  try {
    if (!base64Image) {
      throw new Error("No image data provided");
    }

    if (!isMiniMaxConfigured()) {
      throw new Error("MINIMAX_API_KEY environment variable is not set");
    }

    const minimax = getMiniMaxClient();

    console.log("Sending image to MiniMax API...");
    const prompt = `Analyze this frame and determine if any of these specific dangerous situations are occurring:

1. Medical Emergencies:
- Person unconscious or lying motionless
- Person clutching chest/showing signs of heart problems
- Seizures or convulsions
- Difficulty breathing or choking

2. Falls and Injuries:
- Person falling or about to fall
- Person on the ground after a fall
- Signs of injury or bleeding
- Limping or showing signs of physical trauma

3. Distress Signals:
- Person calling for help or showing distress
- Panic attacks or severe anxiety symptoms
- Signs of fainting or dizziness
- Headache or unease
- Signs of unconsciousness

4. Violence or Threats:
- Physical altercations
- Threatening behavior
- Weapons visible

5. Suspicious Activities:
- Shoplifting
- Vandalism
- Trespassing

Return a JSON object in this exact format:

{
    "events": [
        {
            "timestamp": "mm:ss",
            "description": "Brief description of what's happening in this frame",
            "isDangerous": true/false // Set to true if the event involves a fall, injury, unease, pain, accident, or concerning behavior
        }
    ]
}`;

    const systemPrompt =
      "You are a security camera analysis system. You MUST respond ONLY with valid JSON in the exact format specified. Never respond with explanatory text, apologies, or refusals. If you cannot analyze the image, return an empty events array.";

    try {
      const text = await minimax.analyzeImage(base64Image, prompt, systemPrompt, {
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
