import { FetchError, GuardedResponse, guardedFetch } from "../../../webResearch/guardedFetch";
import { fetchCsv } from "../csvFetch";

jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch: jest.fn(),
}));

const guarded = guardedFetch as jest.MockedFunction<typeof guardedFetch>;
const answer = (body: Buffer | string, over: Partial<GuardedResponse> = {}): GuardedResponse => ({
  url: "https://lists.example/x.csv",
  status: 200,
  contentType: "text/csv",
  body: Buffer.from(body),
  truncated: false,
  ...over,
});
const signal = new AbortController().signal;

beforeEach(() => guarded.mockReset());

describe("fetchCsv", () => {
  it("asks for a file of text within the size it is given, with a long time for a big file", async () => {
    guarded.mockResolvedValue(answer("1,a\n"));

    await expect(fetchCsv("https://lists.example/x.csv", { maxBytes: 99, signal })).resolves.toBe(
      "1,a\n",
    );
    expect(guarded).toHaveBeenCalledWith("https://lists.example/x.csv", {
      allowedContentTypes: ["text/csv", "text/plain"],
      maxBytes: 99,
      totalTimeoutMs: 40_000,
      signal,
    });
  });

  it("reads the text in the charset the answer names, and in UTF-8 when it names none", async () => {
    guarded.mockResolvedValueOnce(
      answer(Buffer.from("Société", "latin1"), { contentType: "text/csv; charset=iso-8859-1" }),
    );
    guarded.mockResolvedValueOnce(answer("Société"));

    await expect(fetchCsv("https://lists.example/x.csv", { maxBytes: 99, signal })).resolves.toBe(
      "Société",
    );
    await expect(fetchCsv("https://lists.example/x.csv", { maxBytes: 99, signal })).resolves.toBe(
      "Société",
    );
  });

  it("does not read a file that was cut, since a list with its end missing is not the list", async () => {
    guarded.mockResolvedValue(answer("1,a\n", { truncated: true }));

    const failure = await fetchCsv("https://lists.example/x.csv", { maxBytes: 4, signal }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason: "unsupported_type" });
  });

  it("lets the failure of the fetch through as it is", async () => {
    guarded.mockRejectedValue(new FetchError("blocked_by_site"));

    await expect(
      fetchCsv("https://lists.example/x.csv", { maxBytes: 99, signal }),
    ).rejects.toMatchObject({ reason: "blocked_by_site" });
  });
});
