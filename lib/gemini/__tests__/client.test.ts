import {
  GeminiClient,
  getGeminiClient,
  isGeminiConfigured,
  resetGeminiClient,
} from "@/lib/gemini/client";

// ---- mock @google/generative-ai ----
const mockGenerateContent = jest.fn();
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
  startChat: mockStartChat,
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

function makeTextResponse(text: string) {
  return { response: { text: () => text } };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetGeminiClient();
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  resetGeminiClient();
});

describe("isGeminiConfigured()", () => {
  it("returns false when GEMINI_API_KEY is not set", () => {
    expect(isGeminiConfigured()).toBe(false);
  });

  it("returns true when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(isGeminiConfigured()).toBe(true);
  });

  it("returns false for empty string", () => {
    process.env.GEMINI_API_KEY = "";
    expect(isGeminiConfigured()).toBe(false);
  });
});

describe("GeminiClient constructor", () => {
  it("throws when GEMINI_API_KEY is missing", () => {
    expect(() => new GeminiClient()).toThrow("GEMINI_API_KEY");
  });

  it("does not throw when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(() => new GeminiClient()).not.toThrow();
  });
});

describe("getGeminiClient() singleton", () => {
  it("returns a GeminiClient instance", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const client = getGeminiClient();
    expect(client).toBeInstanceOf(GeminiClient);
  });

  it("returns the same instance on repeated calls", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const a = getGeminiClient();
    const b = getGeminiClient();
    expect(a).toBe(b);
  });

  it("returns a new instance after resetGeminiClient()", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const a = getGeminiClient();
    resetGeminiClient();
    const b = getGeminiClient();
    expect(a).not.toBe(b);
  });
});

describe("GeminiClient.analyzeImage()", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("calls generateContent with image part and returns text", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("analysis result"));
    const client = new GeminiClient();
    const result = await client.analyzeImage("base64data", "describe this");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result).toBe("analysis result");
  });

  it("strips the data URL prefix from base64", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("ok"));
    const client = new GeminiClient();
    await client.analyzeImage("data:image/jpeg;base64,abc123", "prompt");
    const callArgs = mockGenerateContent.mock.calls[0][0];
    const imagePart = callArgs.find(
      (p: any) => p && typeof p === "object" && "inlineData" in p
    );
    expect(imagePart.inlineData.data).toBe("abc123");
  });

  it("passes systemPrompt as systemInstruction", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("ok"));
    const client = new GeminiClient();
    await client.analyzeImage("img", "prompt", "sys prompt");
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: "sys prompt" })
    );
  });

  it("does not set systemInstruction when systemPrompt is omitted", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("ok"));
    const client = new GeminiClient();
    await client.analyzeImage("img", "prompt");
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.not.objectContaining({ systemInstruction: expect.anything() })
    );
  });
});

describe("GeminiClient.textCompletion()", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns empty string when no non-system messages", async () => {
    const client = new GeminiClient();
    const result = await client.textCompletion([
      { role: "system", content: "sys" },
    ]);
    expect(result).toBe("");
  });

  it("calls generateContent for single user message", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("hello"));
    const client = new GeminiClient();
    const result = await client.textCompletion([
      { role: "user", content: "hi" },
    ]);
    expect(mockGenerateContent).toHaveBeenCalledWith("hi");
    expect(result).toBe("hello");
  });

  it("extracts system message as systemInstruction", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("ok"));
    const client = new GeminiClient();
    await client.textCompletion([
      { role: "system", content: "be concise" },
      { role: "user", content: "hi" },
    ]);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: "be concise" })
    );
  });

  it("uses chat for multiple user/assistant messages", async () => {
    mockSendMessage.mockResolvedValue(makeTextResponse("reply"));
    const client = new GeminiClient();
    const result = await client.textCompletion([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ]);
    expect(mockStartChat).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith("third");
    expect(result).toBe("reply");
  });

  it("maps assistant role to 'model' for chat history", async () => {
    mockSendMessage.mockResolvedValue(makeTextResponse("r"));
    const client = new GeminiClient();
    await client.textCompletion([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" },
    ]);
    const historyArg = mockStartChat.mock.calls[0][0].history;
    expect(historyArg[0].role).toBe("user");
    expect(historyArg[1].role).toBe("model");
  });
});

describe("GeminiClient.prefilterImage()", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns true when response starts with YES", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("YES, this is relevant"));
    const client = new GeminiClient();
    const result = await client.prefilterImage("img", "is this relevant?");
    expect(result).toBe(true);
  });

  it("returns true for lowercase 'yes'", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("yes"));
    const client = new GeminiClient();
    expect(await client.prefilterImage("img", "prompt")).toBe(true);
  });

  it("returns false when response does not start with YES", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse("NO, not relevant"));
    const client = new GeminiClient();
    const result = await client.prefilterImage("img", "prompt");
    expect(result).toBe(false);
  });

  it("returns false for empty response", async () => {
    mockGenerateContent.mockResolvedValue(makeTextResponse(""));
    const client = new GeminiClient();
    expect(await client.prefilterImage("img", "prompt")).toBe(false);
  });
});
