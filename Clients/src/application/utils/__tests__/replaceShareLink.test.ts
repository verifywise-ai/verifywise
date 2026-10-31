import { describe, it, expect, vi } from "vitest";
import { replaceShareLink } from "../replaceShareLink";

const ME = 7;
const LINKS = [
  { id: 1, is_enabled: true, created_by: ME },
  { id: 2, is_enabled: false, created_by: ME },
  { id: 3, is_enabled: true, created_by: ME },
  { id: 4, is_enabled: true, created_by: 99 },
];

describe("replaceShareLink", () => {
  it("creates the new link before disabling the user's enabled old links", async () => {
    const calls: string[] = [];
    const result = await replaceShareLink({
      existingLinks: LINKS,
      currentUserId: ME,
      createLink: async () => {
        calls.push("create");
        return "https://share/new";
      },
      disableLink: async (id) => {
        calls.push(`disable ${id}`);
      },
    });
    expect(calls).toEqual(["create", "disable 1", "disable 3"]);
    expect(result).toEqual({ created: true, failed: 0, othersStillActive: 1, errors: [] });
  });

  it("leaves the old links alone when the new link is not created", async () => {
    const disableLink = vi.fn();
    const result = await replaceShareLink({
      existingLinks: LINKS,
      currentUserId: ME,
      createLink: async () => "",
      disableLink,
    });
    expect(result).toEqual({ created: false });
    expect(disableLink).not.toHaveBeenCalled();
  });

  it("tries every own link and reports the ones that stay active", async () => {
    const error = new Error("500");
    const disableLink = vi.fn(async (id: number) => {
      if (id === 1) throw error;
    });
    const result = await replaceShareLink({
      existingLinks: LINKS,
      currentUserId: ME,
      createLink: async () => "https://share/new",
      disableLink,
    });
    expect(disableLink).toHaveBeenCalledTimes(2);
    expect(disableLink).toHaveBeenCalledWith(3);
    expect(result).toEqual({ created: true, failed: 1, othersStillActive: 1, errors: [error] });
  });

  it("never tries to disable links created by other users", async () => {
    const disableLink = vi.fn();
    await replaceShareLink({
      existingLinks: LINKS,
      currentUserId: ME,
      createLink: async () => "https://share/new",
      disableLink,
    });
    expect(disableLink).not.toHaveBeenCalledWith(4);
  });
});
