import { describe, expect, it } from "vitest";
import { splitServerErrors } from "../serverErrors";

describe("splitServerErrors", () => {
  it("puts an error on a field the form shows under that field", () => {
    expect(splitServerErrors([{ field: "project_title", message: "Too long" }])).toEqual({
      fieldErrors: { project_title: "Too long" },
      formMessages: [],
    });
  });

  // The body sends the chosen regulations as `framework`; the form shows them
  // in the regulations field, so a wrong-scope framework error goes there.
  it("shows a framework error on the regulations field", () => {
    expect(
      splitServerErrors([
        { field: "framework", message: "Framework 4 can't be used for this kind of use case" },
      ]),
    ).toEqual({
      fieldErrors: {
        monitored_regulations_and_standards: "Framework 4 can't be used for this kind of use case",
      },
      formMessages: [],
    });
  });

  it("keeps an error on a field the form does not show as a form message", () => {
    expect(splitServerErrors([{ field: "uc_id", message: "uc_id must be a string" }])).toEqual({
      fieldErrors: {},
      formMessages: ["uc_id must be a string"],
    });
  });

  it("ignores malformed entries and non-arrays", () => {
    expect(splitServerErrors([null, { field: 1, message: "x" }, { field: "goal" }])).toEqual({
      fieldErrors: {},
      formMessages: [],
    });
    expect(splitServerErrors("Bad Request")).toEqual({ fieldErrors: {}, formMessages: [] });
  });
});
