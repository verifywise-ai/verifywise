import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { SidebarMenuItem } from "../../../components/Sidebar/SidebarShell";

const shell = vi.hoisted(() => ({
  props: null as null | {
    flatItems: SidebarMenuItem[];
    isItemActive: (item: SidebarMenuItem) => boolean;
    onItemClick: (item: SidebarMenuItem) => void;
  },
}));

vi.mock("../../../components/Sidebar/SidebarShell", () => ({
  default: (props: typeof shell.props) => {
    shell.props = props;
    return null;
  },
}));
vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
}));

import BiasAuditSidebar from "../BiasAuditSidebar";

describe("BiasAuditSidebar", () => {
  it("lists the four sections with the runs and scope determination counts", () => {
    render(
      <BiasAuditSidebar
        activeSection="runs"
        onSectionChange={vi.fn()}
        runsCount={4}
        scopeCount={2}
      />,
    );
    const items = shell.props!.flatItems;
    expect(items.map((i) => [i.label, i.count])).toEqual([
      ["Profile", undefined],
      ["Test candidates", undefined],
      ["Runs", 4],
      ["Scope determination", 2],
    ]);
    expect(items.filter((i) => shell.props!.isItemActive(i)).map((i) => i.value)).toEqual(["runs"]);
  });

  it("reports the clicked section", () => {
    const onSectionChange = vi.fn();
    render(<BiasAuditSidebar activeSection="profile" onSectionChange={onSectionChange} />);
    shell.props!.onItemClick(shell.props!.flatItems[3]);
    expect(onSectionChange).toHaveBeenCalledWith("scope");
  });

  it("offers corpus generation between the profile and runs", () => {
    const onSectionChange = vi.fn();
    render(<BiasAuditSidebar activeSection="generate" onSectionChange={onSectionChange} />);
    const items = shell.props!.flatItems;
    expect(items.map((i) => i.value)).toEqual(["profile", "generate", "runs", "scope"]);
    expect(items.filter((i) => shell.props!.isItemActive(i)).map((i) => i.value)).toEqual([
      "generate",
    ]);
    shell.props!.onItemClick(items[1]);
    expect(onSectionChange).toHaveBeenCalledWith("generate");
  });

  it("disables every section when there is no use case to open", () => {
    render(<BiasAuditSidebar activeSection="profile" onSectionChange={vi.fn()} disabled />);
    expect(shell.props!.flatItems.every((i) => i.disabled)).toBe(true);
  });
});
