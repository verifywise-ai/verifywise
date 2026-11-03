import { eventRowFitsColumns, SHADOW_AI_EVENT_LIMITS } from "../shadowAiEventLimits";

const row = {
  user_email: "a@b.co",
  destination: "chat.openai.com",
  action: "allowed",
  event_timestamp: new Date("2026-02-10T00:00:00.000Z"),
};

describe("eventRowFitsColumns", () => {
  it("accepts a row within every limit", () => {
    expect(eventRowFitsColumns(row)).toBe(true);
    expect(
      eventRowFitsColumns({
        ...row,
        uri_path: "/".repeat(SHADOW_AI_EVENT_LIMITS.uri_path),
        detected_model: "m".repeat(SHADOW_AI_EVENT_LIMITS.detected_model),
        department: "é".repeat(SHADOW_AI_EVENT_LIMITS.department),
      }),
    ).toBe(true);
  });

  it.each(Object.entries(SHADOW_AI_EVENT_LIMITS))(
    "rejects a %s one character over its column",
    (column, max) => {
      expect(eventRowFitsColumns({ ...row, [column]: "x".repeat(max + 1) })).toBe(false);
    },
  );

  it("rejects a NUL character", () => {
    expect(eventRowFitsColumns({ ...row, department: "R\u0000D" })).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    expect(eventRowFitsColumns({ ...row, event_timestamp: new Date("not a date") })).toBe(false);
  });
});
