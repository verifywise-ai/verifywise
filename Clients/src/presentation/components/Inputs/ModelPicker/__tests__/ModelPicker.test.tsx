import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ModelPicker, { retiringSoon } from "../index";
import type { ModelInfo } from "../../../../utils/providers";

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

const MODELS: ModelInfo[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    inputCost: 0.75,
    outputCost: 3.75,
    contextWindow: 1_048_576,
  },
  { id: "gemini-3.1-flash-lite", name: "gemini-3.1-flash-lite", deprecationDate: soon },
  { id: "my-tuned-model", name: "my-tuned-model" },
];

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <ModelPicker
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      models={MODELS}
      savedModelIds={["my-tuned-model"]}
      showPrices
    />
  );
}

describe("ModelPicker", () => {
  it("lists saved models first, then the catalog with prices, context and retirement", async () => {
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByPlaceholderText("Search or type a model ID"));

    const list = await screen.findByRole("listbox");
    const groups = within(list).getAllByText(/Saved models|All models/);
    expect(groups.map((g) => g.textContent)).toEqual(["Saved models", "All models"]);
    expect(within(list).getByText("Gemini 3.8 Flash")).toBeInTheDocument();
    expect(within(list).getByText("gemini-3.8-flash")).toBeInTheDocument();
    expect(within(list).getByText("$0.75/1M in • $3.75/1M out • 1M context")).toBeInTheDocument();
    expect(within(list).getByText(`Retires ${soon}`)).toBeInTheDocument();
  });

  it("filters by name or ID and picks the model ID", async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Search or type a model ID"), "3.8");

    const list = await screen.findByRole("listbox");
    expect(within(list).queryByText("my-tuned-model")).not.toBeInTheDocument();
    await userEvent.click(within(list).getByText("Gemini 3.8 Flash"));
    expect(onChange).toHaveBeenLastCalledWith("gemini-3.8-flash");
  });

  it("accepts a typed ID that is not in the list", async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    await userEvent.type(
      screen.getByPlaceholderText("Search or type a model ID"),
      "brand-new-model",
    );
    expect(onChange).toHaveBeenLastCalledWith("brand-new-model");
  });

  it("flags only retirements within 90 days", () => {
    const today = new Date("2026-10-19T00:00:00Z");
    expect(retiringSoon("2026-11-30", today)).toBe("2026-11-30");
    expect(retiringSoon("2027-06-01", today)).toBeUndefined();
    expect(retiringSoon(undefined, today)).toBeUndefined();
  });
});

describe("ModelPicker loading", () => {
  it("says the catalog is loading while there are no models yet", async () => {
    renderWithProviders(<ModelPicker value="" onChange={() => {}} models={[]} loading />);
    await userEvent.click(screen.getByPlaceholderText("Search or type a model ID"));
    expect(await screen.findByText(/Loading/)).toBeInTheDocument();
  });
});
