import { describe, it, expect } from "vitest";
import { parseEnvelope, HttpError } from "./httpEnvelope";

const fakeRes = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("httpEnvelope", () => {
  it("returns inner data on 2xx", async () => {
    const r = await parseEnvelope<{ token: string }>(fakeRes(202, { message: "Accepted", data: { token: "t" } }));
    expect(r.status).toBe(202);
    expect(r.data.token).toBe("t");
  });

  it("throws HttpError on non-2xx with the parsed body", async () => {
    await expect(parseEnvelope(fakeRes(404, { message: "Not Found", data: "Model not found for this key" }))).rejects.toBeInstanceOf(HttpError);
  });
});
