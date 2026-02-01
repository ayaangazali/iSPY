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
    const { messages, events } = await request.json();

    const contextMessage =
      events.length > 0
        ? `Here are the recent events that have occurred during the video stream:\n${events
            .map(
              (event: any) =>
                `- At ${event.timestamp}: ${event.description}${event.isDangerous ? " (Warning: Dangerous)" : ""}`
            )
            .join(
              "\n"
            )}\n\nPlease help the user with any questions about these events or provide general assistance.`
        : "No events have been detected yet. I can still help you with any questions about the video stream or general assistance.";

    const systemMessage = `You are a helpful assistant monitoring a real-time video stream. You have access to detected events and can provide guidance, especially during dangerous situations. Be concise but informative, and show appropriate concern for dangerous events while remaining calm and helpful.

${contextMessage}`;

    console.log("Sending request to MiniMax...");
    const text = await minimax.textCompletion(
      [{ role: "system", content: systemMessage }, ...messages],
      { maxTokens: 500 }
    );

    if (!text) {
      throw new Error("Invalid response from MiniMax");
    }

    console.log("Successfully received response from MiniMax");
    return NextResponse.json({
      content: text,
      role: "assistant",
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: `Failed to get chat response: ${errorMessage}` },
      { status: 500 }
    );
  }
}
