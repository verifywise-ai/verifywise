import express from "express";
import request from "supertest";

// The export controller names downloads with res.attachment(); this pins what
// Express (the content-disposition package) sends for names the app can produce.
const app = express();
app.get("/dl", (req, res) => {
  res.attachment(String(req.query.name));
  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from("x"));
});

describe("res.attachment for policy export names", () => {
  it("keeps the type set after attachment()", async () => {
    const res = await request(app).get("/dl").query({ name: "Policy_2026-03-15.pdf" });
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe("attachment; filename=Policy_2026-03-15.pdf");
  });

  it("adds filename* for a non-Latin name", async () => {
    const res = await request(app).get("/dl").query({ name: "政策_2026-03-15.pdf" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain(
      "filename*=UTF-8''%E6%94%BF%E7%AD%96_2026-03-15.pdf",
    );
    expect(res.headers["content-disposition"]).toMatch(/^[\x20-\x7e]+$/);
  });

  it("encodes a name with an astral character", async () => {
    const res = await request(app).get("/dl").query({ name: "\u{20000}_2026-03-15.pdf" });
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''%F0%A0%80%80_");
  });
});
