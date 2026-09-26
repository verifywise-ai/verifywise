import { screen } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { server } from "../../../../test/mocks/server";
import SharedView from "../index";

function renderView(route = "/shared/vendors/test-token") {
  return renderWithProviders(
    <Routes>
      <Route path="/shared/:resourceType/:token" element={<SharedView />} />
    </Routes>,
    { route },
  );
}

describe("SharedView Page", () => {
  it("renders a main landmark and h1 while loading", () => {
    server.use(
      http.get("/api/shares/view/:token", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );

    renderView();

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Loading shared view..." }),
    ).toBeInTheDocument();
  });

  it("names the export control and uses a page heading", async () => {
    server.use(
      http.get("/api/shares/view/:token", () =>
        HttpResponse.json({
          data: {
            share_link: { resource_type: "vendors" },
            data: [{ id: 1, name: "Acme" }],
            permissions: { allowDataExport: true },
          },
        }),
      ),
    );

    renderView();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Shared Vendors List" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export data" })).toBeInTheDocument();
  });

  it("uses a main landmark and h1 when access is forbidden", async () => {
    server.use(
      http.get("/api/shares/view/:token", () =>
        HttpResponse.json({ message: "This share link is no longer valid" }, { status: 403 }),
      ),
    );

    renderView();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Access Forbidden" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
