import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ReasonList from "../ReasonList";
import { setLanguage } from "../../../../test/i18nHelpers";
import { storageService } from "../../../../infrastructure/storage";

const items = [{ article: "Article 50", text: "Disclosure.", appliesFrom: "2026-08-02" }];
const dateIn = (locale: string) =>
  new Date("2026-08-02").toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

describe("ReasonList dates", () => {
  afterEach(async () => {
    await setLanguage("en");
    storageService.set("language", "en");
  });

  it("keeps the English format in English", async () => {
    await setLanguage("en");
    render(<ReasonList heading="Why" items={items} />);
    expect(screen.getByText("2 Aug 2026")).toBeInTheDocument();
  });

  it("formats the date in French when the UI language is French", async () => {
    await setLanguage("fr");
    render(<ReasonList heading="Why" items={items} />);
    expect(screen.getByText(dateIn("fr-FR"))).toBeInTheDocument();
    expect(screen.getByText(/août/)).toBeInTheDocument();
  });

  it("formats the date in German", async () => {
    await setLanguage("de");
    render(<ReasonList heading="Why" items={items} />);
    expect(screen.getByText(dateIn("de-DE"))).toBeInTheDocument();
  });
});
