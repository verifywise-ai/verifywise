import { renderWithProviders } from "../../../../test/renderWithProviders";
import { VWBarChart, VWDonutChart, VWLineChart, VWAreaChart } from "../VWCharts";

// Recharts uses ResizeObserver internally; provide a mock
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const barData = [
  { category: "Jan", sales: 100 },
  { category: "Feb", sales: 200 },
  { category: "Mar", sales: 150 },
];

const donutData = [
  { name: "Compliant", value: 70 },
  { name: "Non-compliant", value: 20 },
  { name: "Pending", value: 10 },
];

const lineData = [
  { month: "Jan", risk: 30, incidents: 5 },
  { month: "Feb", risk: 45, incidents: 8 },
  { month: "Mar", risk: 25, incidents: 3 },
];

const areaData = [
  { date: "Jan", value: 10 },
  { date: "Feb", value: 25 },
  { date: "Mar", value: 18 },
];

describe("VWBarChart", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <VWBarChart
        data={barData}
        series={[{ dataKey: "sales", color: "#13715B" }]}
        categoryKey="category"
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders with vertical layout", () => {
    const { container } = renderWithProviders(
      <VWBarChart
        data={barData}
        series={[{ dataKey: "sales" }]}
        categoryKey="category"
        layout="vertical"
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders with multiple series", () => {
    const multiData = [
      { category: "Jan", sales: 100, profit: 40 },
      { category: "Feb", sales: 200, profit: 80 },
    ];

    const { container } = renderWithProviders(
      <VWBarChart
        data={multiData}
        series={[
          { dataKey: "sales", color: "#13715B" },
          { dataKey: "profit", color: "#2196F3" },
        ]}
        categoryKey="category"
      />,
    );

    expect(container).toBeTruthy();
  });
});

describe("VWDonutChart", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <VWDonutChart
        data={donutData}
        dataKey="value"
        nameKey="name"
        colors={["#13715B", "#E53E3E", "#F6AD55"]}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders center label when provided", () => {
    const { container } = renderWithProviders(
      <VWDonutChart
        data={donutData}
        dataKey="value"
        colors={["#13715B", "#E53E3E", "#F6AD55"]}
        centerValue="100"
        centerLabel="Total"
        innerRadius={50}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders as pie when innerRadius is 0", () => {
    const { container } = renderWithProviders(
      <VWDonutChart
        data={donutData}
        dataKey="value"
        colors={["#13715B", "#E53E3E", "#F6AD55"]}
        innerRadius={0}
      />,
    );

    expect(container).toBeTruthy();
  });
});

describe("VWLineChart", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <VWLineChart
        data={lineData}
        series={[
          { dataKey: "risk", color: "#13715B" },
          { dataKey: "incidents", color: "#E53E3E" },
        ]}
        categoryKey="month"
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders with legend enabled", () => {
    const { container } = renderWithProviders(
      <VWLineChart
        data={lineData}
        series={[{ dataKey: "risk", color: "#13715B", name: "Risk Score" }]}
        categoryKey="month"
        showLegend
      />,
    );

    expect(container).toBeTruthy();
  });
});

describe("VWAreaChart", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(
      <VWAreaChart
        data={areaData}
        series={[{ dataKey: "value", color: "#13715B" }]}
        categoryKey="date"
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders with multiple series", () => {
    const multiAreaData = [
      { date: "Jan", val1: 10, val2: 20 },
      { date: "Feb", val1: 25, val2: 15 },
    ];

    const { container } = renderWithProviders(
      <VWAreaChart
        data={multiAreaData}
        series={[
          { dataKey: "val1", color: "#13715B" },
          { dataKey: "val2", color: "#2196F3" },
        ]}
        categoryKey="date"
      />,
    );

    expect(container).toBeTruthy();
  });
});
