import { POST, GET } from "@/app/api/shoplift-alert/route";
import { SHOPLIFTING_EVENT_TYPE } from "@/lib/shoplift-alerts/types";

jest.mock("@/lib/shoplift-alerts/pipeline", () => ({
  runShopliftAlertPipeline: jest.fn().mockResolvedValue({
    triggered: true,
    audioPath: "/tmp/alert.wav",
    fallbackUsed: true,
  }),
}));

import { runShopliftAlertPipeline } from "@/lib/shoplift-alerts/pipeline";

const mockRunPipeline = runShopliftAlertPipeline as jest.MockedFunction<typeof runShopliftAlertPipeline>;

const validEvent = {
  event_type: SHOPLIFTING_EVENT_TYPE,
  camera_id: "cam-1",
  location: "Aisle 3",
  confidence: 0.9,
  timestamp: new Date().toISOString(),
};

function makeReq(body: object) {
  return new Request("http://localhost/api/shoplift-alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/shoplift-alert — validation", () => {
  it("returns 400 for invalid event body", async () => {
    const res = await POST(makeReq({ not_a_valid_event: true }) as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 when event_type is wrong", async () => {
    const res = await POST(makeReq({ ...validEvent, event_type: "wrong_type" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when confidence is out of range", async () => {
    const res = await POST(makeReq({ ...validEvent, confidence: 1.5 }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeReq({ event_type: SHOPLIFTING_EVENT_TYPE }) as any);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/shoplift-alert — valid event", () => {
  it("returns 200 and calls runShopliftAlertPipeline", async () => {
    const res = await POST(makeReq(validEvent) as any);
    expect(res.status).toBe(200);
    expect(mockRunPipeline).toHaveBeenCalledWith(expect.objectContaining({
      event_type: SHOPLIFTING_EVENT_TYPE,
      camera_id: "cam-1",
    }));
  });

  it("returns triggered, reason, audioPath, fallbackUsed in response", async () => {
    mockRunPipeline.mockResolvedValueOnce({
      triggered: true,
      audioPath: "/alerts/audio/beep.wav",
      fallbackUsed: true,
    });

    const res = await POST(makeReq(validEvent) as any);
    const data = await res.json();
    expect(data).toHaveProperty("triggered");
    expect(data).toHaveProperty("audioPath");
    expect(data).toHaveProperty("fallbackUsed");
  });

  it("triggered: false is returned when pipeline suppresses", async () => {
    mockRunPipeline.mockResolvedValueOnce({
      triggered: false,
      reason: "below_threshold",
    });

    const res = await POST(makeReq(validEvent) as any);
    const data = await res.json();
    expect(data.triggered).toBe(false);
    expect(data.reason).toBe("below_threshold");
  });
});

describe("POST /api/shoplift-alert — error handling", () => {
  it("returns 500 when pipeline throws", async () => {
    mockRunPipeline.mockRejectedValueOnce(new Error("Pipeline crashed"));
    const res = await POST(makeReq(validEvent) as any);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/shoplift-alert", () => {
  it("returns endpoint info", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBeDefined();
  });
});
