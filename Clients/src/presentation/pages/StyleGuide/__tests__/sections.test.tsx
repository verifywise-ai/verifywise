/**
 * Lightweight smoke tests for the StyleGuide showcase sections.
 *
 * These sections are internal, developer-facing documentation for the
 * design system (not user-facing product logic), and are almost entirely
 * static presentational markup. Rather than one exhaustive test file per
 * section, we render each section standalone and assert it mounts without
 * throwing and displays its expected page title.
 */
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

import AccessibilitySection from "../sections/AccessibilitySection";
import AlertsSection from "../sections/AlertsSection";
import AnimationsSection from "../sections/AnimationsSection";
import AvatarsSection from "../sections/AvatarsSection";
import BreadcrumbsSection from "../sections/BreadcrumbsSection";
import BreakpointsSection from "../sections/BreakpointsSection";
import ButtonsSection from "../sections/ButtonsSection";
import CardsSection from "../sections/CardsSection";
import ChipSection from "../sections/ChipSection";
import ColorsSection from "../sections/ColorsSection";
import CommonPatternsSection from "../sections/CommonPatternsSection";
import DosAndDontsSection from "../sections/DosAndDontsSection";
import EmptyStatesSection from "../sections/EmptyStatesSection";
import FileStructureSection from "../sections/FileStructureSection";
import FormInputsSection from "../sections/FormInputsSection";
import IconsSection from "../sections/IconsSection";
import LoadingStatesSection from "../sections/LoadingStatesSection";
import ModalsSection from "../sections/ModalsSection";
import PaginationSection from "../sections/PaginationSection";
import ShadowsSection from "../sections/ShadowsSection";
import SpacingLayoutSection from "../sections/SpacingLayoutSection";
import StatusSection from "../sections/StatusSection";
import TablesSection from "../sections/TablesSection";
import TabsSection from "../sections/TabsSection";
import TagsSection from "../sections/TagsSection";
import TogglesSection from "../sections/TogglesSection";
import TooltipsSection from "../sections/TooltipsSection";
import TypographySection from "../sections/TypographySection";
import ZIndexSection from "../sections/ZIndexSection";

const sections: Array<{
  name: string;
  Component: React.ComponentType;
  title: string;
}> = [
  {
    name: "AccessibilitySection",
    Component: AccessibilitySection,
    title: "Accessibility guidelines",
  },
  { name: "AlertsSection", Component: AlertsSection, title: "Alerts & toasts" },
  { name: "AnimationsSection", Component: AnimationsSection, title: "Animations & transitions" },
  { name: "AvatarsSection", Component: AvatarsSection, title: "Avatars" },
  { name: "BreadcrumbsSection", Component: BreadcrumbsSection, title: "Breadcrumbs" },
  { name: "BreakpointsSection", Component: BreakpointsSection, title: "Breakpoints & responsive" },
  { name: "ButtonsSection", Component: ButtonsSection, title: "Buttons" },
  { name: "CardsSection", Component: CardsSection, title: "Cards & containers" },
  { name: "ChipSection", Component: ChipSection, title: "Chips" },
  { name: "ColorsSection", Component: ColorsSection, title: "Colors" },
  { name: "CommonPatternsSection", Component: CommonPatternsSection, title: "Common patterns" },
  { name: "DosAndDontsSection", Component: DosAndDontsSection, title: "Do's and don'ts" },
  { name: "EmptyStatesSection", Component: EmptyStatesSection, title: "Empty states" },
  { name: "FileStructureSection", Component: FileStructureSection, title: "File structure" },
  { name: "FormInputsSection", Component: FormInputsSection, title: "Form inputs" },
  { name: "IconsSection", Component: IconsSection, title: "Icons" },
  { name: "LoadingStatesSection", Component: LoadingStatesSection, title: "Loading states" },
  { name: "ModalsSection", Component: ModalsSection, title: "Modals & drawers" },
  { name: "PaginationSection", Component: PaginationSection, title: "Pagination" },
  { name: "ShadowsSection", Component: ShadowsSection, title: "Shadows & elevation" },
  { name: "SpacingLayoutSection", Component: SpacingLayoutSection, title: "Spacing & layout" },
  { name: "StatusSection", Component: StatusSection, title: "Status indicators" },
  { name: "TablesSection", Component: TablesSection, title: "Tables" },
  { name: "TabsSection", Component: TabsSection, title: "Tabs" },
  { name: "TagsSection", Component: TagsSection, title: "Tags & chips" },
  { name: "TogglesSection", Component: TogglesSection, title: "Toggles & checkboxes" },
  { name: "TooltipsSection", Component: TooltipsSection, title: "Tooltips" },
  { name: "TypographySection", Component: TypographySection, title: "Typography" },
  { name: "ZIndexSection", Component: ZIndexSection, title: "Z-Index scale" },
];

describe("StyleGuide sections", () => {
  it.each(sections)(
    "$name renders without crashing and shows its title",
    ({ Component, title }) => {
      renderWithProviders(<Component />);
      // Some sections repeat the title text inside example/live-preview cards,
      // so assert at least one match rather than requiring a unique node.
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    },
  );
});
