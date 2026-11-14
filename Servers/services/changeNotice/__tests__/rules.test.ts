import { decideShow, MAX_KEYS, NOTICE_ID_RE, type NoticeState } from "../rules";

const NOW = new Date("2026-12-01T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const base = {
  state: undefined as NoticeState | undefined,
  accountCreatedAt: daysAgo(200),
  orgFirstSeenAt: daysAgo(10) as Date | null,
  keyCount: 0,
  now: NOW,
};

const stateOf = (over: Partial<NoticeState> = {}): NoticeState => ({
  first_seen_at: daysAgo(1).toISOString(),
  views: 1,
  dismissed_at: null,
  ...over,
});

describe("decideShow", () => {
  it("shows an account older than the organization anchor with no state yet", () => {
    expect(decideShow(base)).toBe(true);
  });

  it("hides a dismissed notice", () => {
    expect(decideShow({ ...base, state: stateOf({ dismissed_at: NOW.toISOString() }) })).toBe(
      false,
    );
  });

  it("shows on the third visit and hides after it", () => {
    expect(decideShow({ ...base, state: stateOf({ views: 2 }) })).toBe(true);
    expect(decideShow({ ...base, state: stateOf({ views: 3 }) })).toBe(false);
  });

  it("hides 91 days after first seen and shows at 89", () => {
    expect(
      decideShow({ ...base, state: stateOf({ first_seen_at: daysAgo(91).toISOString() }) }),
    ).toBe(false);
    expect(
      decideShow({ ...base, state: stateOf({ first_seen_at: daysAgo(89).toISOString() }) }),
    ).toBe(true);
  });

  it("hides from an account created after the organization's first view", () => {
    expect(decideShow({ ...base, accountCreatedAt: daysAgo(5), orgFirstSeenAt: daysAgo(10) })).toBe(
      false,
    );
  });

  it("shows to the first viewer in the organization", () => {
    expect(decideShow({ ...base, accountCreatedAt: daysAgo(1), orgFirstSeenAt: null })).toBe(true);
  });

  it("refuses a new notice id once the user holds the maximum number of keys", () => {
    expect(decideShow({ ...base, keyCount: MAX_KEYS })).toBe(false);
    expect(decideShow({ ...base, keyCount: MAX_KEYS - 1 })).toBe(true);
  });

  it("still shows an existing notice when the user is at the key limit", () => {
    expect(decideShow({ ...base, state: stateOf(), keyCount: MAX_KEYS })).toBe(true);
  });
});

describe("NOTICE_ID_RE", () => {
  it("accepts lowercase slugs and rejects everything else", () => {
    expect(NOTICE_ID_RE.test("ai-detection-2026")).toBe(true);
    expect(NOTICE_ID_RE.test("Bad_ID")).toBe(false);
    expect(NOTICE_ID_RE.test("-lead")).toBe(false);
    expect(NOTICE_ID_RE.test("a".repeat(65))).toBe(false);
    expect(NOTICE_ID_RE.test("a".repeat(64))).toBe(true);
  });
});
