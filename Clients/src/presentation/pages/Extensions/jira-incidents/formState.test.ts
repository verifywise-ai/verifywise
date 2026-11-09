import { describe, expect, it } from "vitest";
import {
  DONT_CHANGE_JIRA,
  fromView,
  toInput,
  validateForm,
  withSeverityDefaults,
  withStatusDefaults,
} from "./formState";
import type { JiraIncidentsConfigView } from "../../../../application/repository/jiraIncidents.repository";

const view: JiraIncidentsConfigView = {
  configured: true,
  site_url: "https://acme.atlassian.net",
  email: "svc@acme.co",
  has_api_token: true,
  service_account_id: "svc-1",
  service_account_time_zone: "UTC",
  project_id: "10000",
  project_key: "SEC",
  issue_type_id: "10001",
  label: null,
  status_map_in: { "1": "Open", "99": "Closed" },
  status_map_out: { Open: "1", Closed: "99" },
  severity_map: {},
  default_project_id: 7,
  default_type: "Malfunction",
  default_reporter: "Jira sync",
  import_from: null,
  last_checked_at: null,
  readiness: { ready: false, reason: "x" },
};
const defaults = {
  default_map_in: { "1": "Open", "3": "Investigating", "4": "Closed" },
  default_map_out: {
    "Open": "1",
    "Investigating": "3",
    "Closed": "4",
    "Mitigated": null,
    "Suspended": null,
    "Emergency action": null,
  },
};
const stored = {
  hasStoredToken: true,
  storedSiteUrl: view.site_url,
  storedEmail: view.email,
};

describe("formState", () => {
  it("keeps saved mappings for current statuses, fills the rest, drops removed ones", () => {
    const form = withStatusDefaults(fromView(view), defaults, ["1", "3", "4"]);
    expect(form.status_map_in).toEqual({ "1": "Open", "3": "Investigating", "4": "Closed" });
    // Closed pointed at the removed status 99, so it falls back to the default.
    expect(form.status_map_out).toEqual({
      "Open": "1",
      "Investigating": "3",
      "Closed": "4",
      "Mitigated": DONT_CHANGE_JIRA,
      "Suspended": DONT_CHANGE_JIRA,
      "Emergency action": DONT_CHANGE_JIRA,
    });
  });

  it("keeps a saved Don't change Jira over the default", () => {
    const form = { ...fromView(view), status_map_out: { Investigating: DONT_CHANGE_JIRA } };
    expect(withStatusDefaults(form, defaults, ["1", "3", "4"]).status_map_out.Investigating).toBe(
      DONT_CHANGE_JIRA,
    );
  });

  it("fills severity defaults and keeps saved ones", () => {
    const form = { ...fromView(view), severity_map: { "3": "Minor", "9": "Serious" } };
    expect(
      withSeverityDefaults(form, { "2": "Very serious", "3": "Serious" }, ["2", "3"]).severity_map,
    ).toEqual({ "2": "Very serious", "3": "Minor" });
  });

  it("accepts a complete form", () => {
    expect(validateForm(fromView(view), { ...stored, statusIds: ["1", "99"] })).toEqual({});
  });

  it("requires the token again after the site URL changes", () => {
    const form = { ...fromView(view), site_url: "https://other.atlassian.net" };
    const errors = validateForm(form, { ...stored, statusIds: ["1"] });
    expect(errors.api_token).toBe("Enter the API token again after changing the site URL or email");
  });

  it("requires a token when none is stored", () => {
    const errors = validateForm(fromView(view), {
      ...stored,
      hasStoredToken: false,
      statusIds: ["1"],
    });
    expect(errors.api_token).toBe("Enter the API token");
  });

  it("asks for every Jira status to be mapped", () => {
    expect(validateForm(fromView(view), { ...stored, statusIds: ["1", "3"] }).status_map_in).toBe(
      "Map every Jira status",
    );
  });

  it("checks email, defaults and reporter", () => {
    const form = {
      ...fromView(view),
      email: "not-an-email",
      default_project_id: "" as const,
      default_type: "",
      default_reporter: "   ",
    };
    expect(validateForm(form, { ...stored, statusIds: [] })).toMatchObject({
      email: "Enter the service account email",
      default_project_id: "Choose a use case",
      default_type: "Choose an incident type",
      default_reporter: "Enter the reporter",
    });
  });

  it("omits an empty token and turns Don't change Jira into null", () => {
    const form = {
      ...fromView(view),
      status_map_out: { Open: "1", Mitigated: DONT_CHANGE_JIRA },
    };
    const input = toInput(form);
    expect(input).not.toHaveProperty("api_token");
    expect(input.status_map_out).toEqual({ Open: "1", Mitigated: null });
    expect(input.label).toBeNull();
    expect(input.default_project_id).toBe(7);
  });

  it("sends a typed token and omits an unset use case", () => {
    const input = toInput({ ...fromView(view), api_token: " new ", default_project_id: "" });
    expect(input.api_token).toBe("new");
    expect(input).not.toHaveProperty("default_project_id");
  });

  describe("first save, before a connection is stored", () => {
    const empty = fromView({
      ...view,
      configured: false,
      site_url: null,
      email: null,
      has_api_token: false,
      project_id: null,
      project_key: null,
      issue_type_id: null,
      status_map_in: {},
      status_map_out: {},
      default_project_id: null,
      default_type: null,
      default_reporter: null,
    });
    const connection = {
      ...empty,
      site_url: "https://acme.atlassian.net",
      email: "svc@acme.co",
      api_token: "token-1",
    };
    const none = { hasStoredToken: false, storedSiteUrl: null, storedEmail: null, statusIds: [] };

    it("checks only the connection fields", () => {
      expect(validateForm(connection, none)).toEqual({});
      expect(Object.keys(validateForm(empty, none)).sort()).toEqual([
        "api_token",
        "email",
        "site_url",
      ]);
    });

    it("sends the connection without empty selection or default fields", () => {
      const input = toInput(connection);
      expect(input).toMatchObject({
        site_url: "https://acme.atlassian.net",
        email: "svc@acme.co",
        api_token: "token-1",
      });
      for (const key of [
        "project_id",
        "project_key",
        "issue_type_id",
        "default_type",
        "default_reporter",
        "default_project_id",
      ]) {
        expect(input).not.toHaveProperty(key);
      }
    });
  });
});
