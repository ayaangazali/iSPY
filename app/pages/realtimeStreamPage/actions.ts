"use server";

import OpenAI from "openai";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
}
const openai = new OpenAI({ apiKey: API_KEY });

export interface VideoEvent {
    timestamp: string;
    description: string;
    isDangerous: boolean;
}

export async function detectEvents(base64Image: string, transcript: string = ''): Promise<{ events: VideoEvent[], rawResponse: string }> {
    console.log('Starting frame analysis...');
    try {
        if (!base64Image) {
            throw new Error("No image data provided");
        }

        console.log('Sending image to OpenAI API...');
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
${transcript ? `Consider this audio transcript from the scene: "${transcript}"
` : ''}
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

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a security camera analysis system. You MUST respond ONLY with valid JSON in the exact format specified. Never respond with explanatory text, apologies, or refusals. If you cannot analyze the image, return an empty events array."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 1000,
                response_format: { type: "json_object" },
            });

            const text = response.choices[0]?.message?.content || "";
            console.log('Raw API Response:', text);

            // Check if the response is a refusal or non-JSON response
            if (text.includes("I'm sorry") || text.includes("I cannot") || text.includes("I can't")) {
                console.log('API refused to process image, returning empty events');
                return {
                    events: [],
                    rawResponse: "No events detected in this frame"
                };
            }

            // Try to extract JSON from the response, handling potential code blocks
            let jsonStr = text.trim();
            
            // First try to extract content from code blocks if present
            const codeBlockMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1];
                console.log('Extracted JSON from code block:', jsonStr);
            } else if (!jsonStr.startsWith('{')) {
                // If no code block and doesn't start with {, try to find raw JSON
                const jsonMatch = text.match(/\{[^]*\}/);  
                if (jsonMatch) {
                    jsonStr = jsonMatch[0];
                    console.log('Extracted raw JSON:', jsonStr);
                }
            }

            try {
                const parsed = JSON.parse(jsonStr);
                return {
                    events: parsed.events || [],
                    rawResponse: text
                };
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError);
                console.log('Attempting to return empty events due to parse error');
                // Return empty events instead of throwing error
                return {
                    events: [],
                    rawResponse: text || "Failed to analyze frame"
                };
            }

        } catch (error) {
            console.error('Error calling API:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error in detectEvents:', error);
        throw error;
    }
}
