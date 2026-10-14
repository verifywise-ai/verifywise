import {
  formatUserName,
  getAgentOwnerIds,
  getAgentSourceLabel,
  getAvatarName,
  getSourceFilterOptions,
  parseOwnerAuditValue,
} from "../agentLabels";

const usersMap = { "1": "Ada Lovelace" };
const t = (key: string) => key;

describe("formatUserName", () => {
  it("names a user id found in the users list", () => {
    expect(formatUserName(1, usersMap, t)).toBe("Ada Lovelace");
    expect(formatUserName("1", usersMap, t)).toBe("Ada Lovelace");
  });

  it("falls back to User #id for a numeric id not in the list", () => {
    expect(formatUserName("7", usersMap, t)).toBe("User #7");
  });

  it("shows a non-numeric value (a source-reported owner) as is", () => {
    expect(formatUserName("alice@contoso.com", usersMap, t)).toBe("alice@contoso.com");
    expect(formatUserName("svc-reporting", usersMap, t)).toBe("svc-reporting");
  });
});

describe("getAvatarName", () => {
  it("splits a known user's name for initials", () => {
    expect(getAvatarName("1", usersMap)).toEqual({ firstname: "Ada", lastname: "Lovelace" });
  });

  it("uses a source-reported value for its initial", () => {
    expect(getAvatarName("alice@contoso.com", usersMap)).toEqual({
      firstname: "alice@contoso.com",
      lastname: "",
    });
  });

  it("gives no initials for an unknown numeric id, so the avatar shows ?", () => {
    expect(getAvatarName("7", usersMap)).toEqual({ firstname: "", lastname: "" });
  });
});

describe("getAgentOwnerIds", () => {
  it("uses the owner set, primary first, when there is one", () => {
    expect(getAgentOwnerIds({ owner_ids: [2, 1], owner_id: "2", is_manual: true })).toEqual([
      "2",
      "1",
    ]);
  });

  it("shows a synced agent's source-reported owner", () => {
    expect(
      getAgentOwnerIds({ owner_ids: [], owner_id: "alice@contoso.com", is_manual: false }),
    ).toEqual(["alice@contoso.com"]);
  });

  it("shows a manual agent's legacy text owner", () => {
    expect(getAgentOwnerIds({ owner_ids: [], owner_id: "Data team", is_manual: true })).toEqual([
      "Data team",
    ]);
  });

  it("does not treat a manual agent's numeric owner_id without owner rows as an owner", () => {
    expect(getAgentOwnerIds({ owner_ids: [], owner_id: "9", is_manual: true })).toEqual([]);
  });

  it("returns no owners when there are none", () => {
    expect(getAgentOwnerIds({ owner_id: null, is_manual: true })).toEqual([]);
  });
});

describe("parseOwnerAuditValue", () => {
  it("reads an owner_ids JSON array, keeping an owner with a comma whole", () => {
    expect(parseOwnerAuditValue('["3","Doe, Jane"]', "owner_ids")).toEqual(["3", "Doe, Jane"]);
  });

  it("reads numbers in a JSON array as ids", () => {
    expect(parseOwnerAuditValue("[3, 4]", "owner_ids")).toEqual(["3", "4"]);
  });

  it("splits a legacy comma-joined owner_ids value", () => {
    expect(parseOwnerAuditValue("1, 2,3", "owner_ids")).toEqual(["1", "2", "3"]);
  });

  it("falls back to the comma split when a value starting with [ is not JSON", () => {
    expect(parseOwnerAuditValue("[team], ops", "owner_ids")).toEqual(["[team]", "ops"]);
  });

  it("reads an owner_id value as one owner, never splitting it", () => {
    expect(parseOwnerAuditValue("Doe, Jane", "owner_id")).toEqual(["Doe, Jane"]);
  });

  it("gives no owners for an empty value", () => {
    expect(parseOwnerAuditValue(null, "owner_ids")).toEqual([]);
    expect(parseOwnerAuditValue("  ", "owner_id")).toEqual([]);
    expect(parseOwnerAuditValue("[]", "owner_ids")).toEqual([]);
  });
});

describe("getAgentSourceLabel", () => {
  it("labels a manual agent Manually entered, like the Source column", () => {
    expect(getAgentSourceLabel({ is_manual: true, source_system: "manual" })).toBe(
      "Manually entered",
    );
  });

  it("uses the source's display name for a synced agent", () => {
    expect(getAgentSourceLabel({ is_manual: false, source_system: "azure-ai-foundry" })).toBe(
      "Azure AI Foundry",
    );
    expect(getAgentSourceLabel({ is_manual: false, source_system: "aws_bedrock" })).toBe(
      "Aws Bedrock",
    );
  });
});

describe("getSourceFilterOptions", () => {
  it("keeps raw keys as values and uses the column labels, once per source", () => {
    expect(
      getSourceFilterOptions([
        { is_manual: true, source_system: "manual" },
        { is_manual: false, source_system: "azure-ai-foundry" },
        { is_manual: false, source_system: "azure-ai-foundry" },
        { is_manual: false, source_system: "" },
      ]),
    ).toEqual([
      { value: "azure-ai-foundry", label: "Azure AI Foundry" },
      { value: "manual", label: "Manually entered" },
    ]);
  });
});
