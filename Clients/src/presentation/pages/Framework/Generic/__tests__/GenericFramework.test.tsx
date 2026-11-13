import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";

const drawerProps = vi.fn();
vi.mock("../../../../components/Drawer/GenericFrameworkDrawer", () => ({
  default: (props: Record<string, unknown>) => {
    drawerProps(props);
    return <div data-testid="generic-drawer" />;
  },
}));

vi.mock("../../../../components/FrameworkFilter/TabFilterBar", () => ({
  TabFilterBar: () => null,
}));

import GenericFramework from "../index";

const importedTree = {
  projects_frameworks_id: 12,
  framework: {
    id: 12,
    key: "imported",
    framework_type: "imported",
    display_name: "Internal AI policy",
    entity_types: { l2_impl: "imported_topic", l3_impl: "imported_subtopic" },
    hierarchy_type: "three_level",
  },
  tree: [
    {
      id: 5,
      title: "Internal AI policy",
      order_no: 1,
      children: [
        {
          struct_id: 31,
          impl_id: 101,
          title: "Data handling",
          number: "A",
          status: "Not started",
          order_no: 1,
          children: [
            {
              struct_id: 41,
              impl_id: 201,
              title: "Retention",
              number: "A.1",
              status: "Implemented",
              order_no: 1,
            },
          ],
        },
        {
          struct_id: 32,
          impl_id: 102,
          title: "Old topic",
          status: "Draft",
          order_no: 2,
          retired: true,
          children: [],
        },
      ],
    },
  ],
};

const bundledTree = {
  ...importedTree,
  framework: { ...importedTree.framework, id: 9, key: "soc2", framework_type: "soc2" },
};

describe("GenericFramework source", () => {
  beforeEach(() => {
    drawerProps.mockClear();
  });

  it("loads an imported framework from the imported tree endpoint", async () => {
    const importedSpy = vi.fn();
    const bundledSpy = vi.fn();
    server.use(
      http.get("/api/v1/imported-framework-assessments/links/12/tree", () => {
        importedSpy();
        return HttpResponse.json({ data: importedTree });
      }),
      http.get("/api/frameworks/:id/tree/:projectId", () => {
        bundledSpy();
        return HttpResponse.json({ data: bundledTree });
      }),
    );

    renderWithProviders(<GenericFramework source="imported" projectId={7} linkId={12} />);

    // The single group node opens by itself; rows use the spreadsheet numbers,
    // falling back to the position when a row has none.
    expect(await screen.findByText("A.1 Retention")).toBeInTheDocument();
    expect(screen.getByText("A Data handling")).toBeInTheDocument();
    expect(screen.getByText(/^2 Old topic/)).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.getByText(/^Topics and subtopics: 1 of 3 completed/)).toBeInTheDocument();
    expect(importedSpy).toHaveBeenCalledTimes(1);
    expect(bundledSpy).not.toHaveBeenCalled();
  });

  it("opens the drawer on the imported impl endpoints without a Notes tab", async () => {
    server.use(
      http.get("/api/v1/imported-framework-assessments/links/12/tree", () =>
        HttpResponse.json({ data: importedTree }),
      ),
    );
    renderWithProviders(<GenericFramework source="imported" projectId={7} linkId={12} />);

    (await screen.findByText("A Data handling")).click();

    await waitFor(() => expect(drawerProps).toHaveBeenCalled());
    expect(drawerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        implBaseUrl: "/v1/imported-framework-assessments/links/12/impl",
        frameworkType: "imported",
        entityType: "imported_topic",
        entityId: 101,
        frameworkId: 0,
        notesAttachedTo: undefined,
      }),
    );
  });

  it("keeps bundled frameworks on /frameworks/:id/tree/:projectId", async () => {
    const bundledSpy = vi.fn();
    server.use(
      http.get("/api/frameworks/9/tree/7", () => {
        bundledSpy();
        return HttpResponse.json({ data: bundledTree });
      }),
    );

    renderWithProviders(<GenericFramework projectId={7} frameworkId={9} />);

    // Page title + group node ("1 Internal AI policy").
    expect(await screen.findByText("1 Internal AI policy")).toBeInTheDocument();
    expect(bundledSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^Topics and subtopics:/)).not.toBeInTheDocument();
  });

  it("passes no impl base url and the real framework id for bundled frameworks", async () => {
    server.use(
      http.get("/api/frameworks/9/tree/7", () => HttpResponse.json({ data: bundledTree })),
    );
    renderWithProviders(<GenericFramework projectId={7} frameworkId={9} />);

    // Bundled accordions start closed; open the group, then the row.
    (await screen.findByText("1 Internal AI policy")).click();
    // Bundled numbering ignores the imported-only `number` field.
    (await screen.findByText("1.1 Data handling")).click();

    await waitFor(() => expect(drawerProps).toHaveBeenCalled());
    expect(drawerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        implBaseUrl: undefined,
        frameworkId: 9,
        notesAttachedTo: "SOC2_IMPORTED_TOPIC",
      }),
    );
  });
});
