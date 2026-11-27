import { describe, it, expect } from "@jest/globals";
import {
  EU_AI_ACT_ORGANIZATION_CONTROLS,
  EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID,
  EU_AI_ACT_ORGANIZATION_QUESTIONS,
  getStructureById,
} from "..";
import { ControlCategories } from "../EU-AI-Act/compliance-tracker/controlCategories.struct";
import { Topics } from "../EU-AI-Act/assessment-tracker/topics.struct";
import { frameworkAdditionMap, frameworkDeletionMap } from "../../types/framework.type";
import {
  createEUAIActOrganizationFrameworkQuery,
  deleteProjectFrameworkEUAIActOrganizationQuery,
} from "../../utils/eu.utils";

describe("EU AI Act (organization)", () => {
  it("is framework 29 and no bundled structure of its own", () => {
    expect(EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID).toBe(29);
    expect(getStructureById(EU_AI_ACT_ORGANIZATION_FRAMEWORK_ID)).toBeNull();
  });

  it("is added and removed by the EU AI Act builders", () => {
    expect(frameworkAdditionMap[29]).toBe(createEUAIActOrganizationFrameworkQuery);
    expect(frameworkDeletionMap[29]).toBe(deleteProjectFrameworkEUAIActOrganizationQuery);
  });

  it("moves categories 0, 1 and 15 whole, plus C6.1, C6.2, C7.1, C10.2 and C17.1", () => {
    const moved = Object.entries(EU_AI_ACT_ORGANIZATION_CONTROLS).flatMap(([category, controls]) =>
      controls.map((control) => {
        const source = ControlCategories.find(
          (c) => c.order_no === Number(category),
        )?.controls.find((c) => c.order_no === control);
        expect(source).toBeDefined();
        return `${category}.${control}`;
      }),
    );
    expect(moved).toEqual([
      "0.1",
      "0.2",
      "0.3",
      "0.4",
      "0.5",
      "0.6",
      "0.7",
      "0.8",
      "1.1",
      "1.2",
      "6.1",
      "6.2",
      "7.1",
      "10.2",
      "15.1",
      "15.2",
      "15.3",
      "17.1",
    ]);
    for (const order of [0, 1, 15]) {
      const category = ControlCategories.find((c) => c.order_no === order)!;
      expect(EU_AI_ACT_ORGANIZATION_CONTROLS[order]).toEqual(
        category.controls.map((c) => c.order_no),
      );
    }
  });

  it("moves 18 controls with 42 subcontrols", () => {
    const controls = Object.entries(EU_AI_ACT_ORGANIZATION_CONTROLS).flatMap(([category, orders]) =>
      ControlCategories.find((c) => c.order_no === Number(category))!.controls.filter((c) =>
        orders.includes(c.order_no),
      ),
    );
    expect(controls).toHaveLength(18);
    expect(controls.flatMap((c) => c.subControls)).toHaveLength(42);
  });

  it("moves questions 5.1.2, 8.1.1, 8.1.2, 8.1.3 and 11.1.1, each one in the EU AI Act assessment", () => {
    const moved = Object.entries(EU_AI_ACT_ORGANIZATION_QUESTIONS).flatMap(([topic, subtopics]) =>
      Object.entries(subtopics).flatMap(([subtopic, questions]) =>
        questions.map((question) => {
          const source = Topics.find((t) => t.order_no === Number(topic))
            ?.subtopics.find((st) => st.order_no === Number(subtopic))
            ?.questions.find((q) => q.order_no === question);
          expect(source).toBeDefined();
          return `${topic}.${subtopic}.${question}`;
        }),
      ),
    );
    expect(moved).toEqual(["5.1.2", "8.1.1", "8.1.2", "8.1.3", "11.1.1"]);
  });
});
