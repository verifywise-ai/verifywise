import { createHmac } from "crypto";

const SECRET = "signed-token-test-secret";
process.env.JWT_SECRET = SECRET;

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSignedToken, verifySignedToken } =
  require("../signedToken.utils") as typeof import("../signedToken.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

const signWith = (secret: string, payload: object) => {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
};

describe("signed tokens", () => {
  it("round-trips a payload", () => {
    const token = createSignedToken({ answer: 4, timestamp: 123 });
    expect(verifySignedToken<{ answer: number; timestamp: number }>(token)).toEqual({
      answer: 4,
      timestamp: 123,
    });
  });

  it("uses the format existing captcha and resubmission tokens already have", () => {
    const payload = { answer: 7, timestamp: 99 };
    expect(createSignedToken(payload)).toBe(signWith(SECRET, payload));
    expect(verifySignedToken(signWith(SECRET, payload))).toEqual(payload);
  });

  it("rejects a tampered token", () => {
    const decoded = JSON.parse(Buffer.from(createSignedToken({ answer: 4 }), "base64").toString());
    decoded.data = JSON.stringify({ answer: 5 });
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64");
    expect(verifySignedToken(tampered)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    expect(verifySignedToken(signWith("another-secret", { answer: 4 }))).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySignedToken("not-a-token")).toBeNull();
  });
});
