import { NextResponse } from "next/server";
import { getMiniMaxClient, isMiniMaxConfigured } from "@/lib/minimax/client";

export async function POST(request: Request) {
  if (!isMiniMaxConfigured()) {
    return NextResponse.json(
      { error: "MiniMax API key not properly configured" },
      { status: 500 }
    );
  }

  try {
    const minimax = getMiniMaxClient();
    const { keyMoments } = await request.json();

    const momentsText = keyMoments
      .map(
        (moment: any) =>
          `Video: ${moment.videoName}\nTimestamp: ${moment.timestamp}\nDescription: ${moment.description}\nDangerous: ${moment.isDangerous ? "Yes" : "No"}\n`
      )
      .join("\n");

    const prompt = `You are an expert at analyzing video safety data. Provide concise, insightful summaries of video analysis data, focusing on safety patterns and potential concerns.

Here are the key moments from video analysis sessions. Please provide a concise summary of the important events and any safety concerns:

${momentsText}

Please format your response in this way:
1. Overall Summary (2-3 sentences)
2. Key Safety Concerns (if any)
3. Notable Patterns (if any)`;

    const text = await minimax.textCompletion(
      [
        {
          role: "system",
          content:
            "You are an expert at analyzing video safety data. Provide concise, insightful summaries focusing on safety patterns and concerns.",
        },
        { role: "user", content: prompt },
      ],
      { maxTokens: 500 }
    );

    if (!text || text.trim().length === 0) {
      return NextResponse.json({
        summary: "No summary could be generated. Please try again.",
      });
    }

    return NextResponse.json({
      summary: text,
    });
  } catch (error: any) {
    console.error("Error generating summary:", error);
    const errorMessage = error.message || "Failed to generate summary";
    return NextResponse.json(
      {
        error: errorMessage,
        details:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
