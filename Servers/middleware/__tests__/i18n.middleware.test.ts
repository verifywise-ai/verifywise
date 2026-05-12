import { describe, it, expect, jest } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { i18nMiddleware } from "../i18n.middleware";

function createReq(acceptLanguage?: string | string[]): Partial<Request> {
  return {
    headers: acceptLanguage !== undefined ? { "accept-language": acceptLanguage } : {},
  } as Partial<Request>;
}

describe("i18nMiddleware", () => {
  it("resolves Accept-Language: de to lang=de", () => {
    const req = createReq("de") as Request;
    const next = jest.fn() as NextFunction;
    i18nMiddleware(req, {} as Response, next);
    expect(req.lang).toBe("de");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("resolves Accept-Language: fr to lang=fr", () => {
    const req = createReq("fr") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.lang).toBe("fr");
  });

  it("strips region tag (de-DE -> de)", () => {
    const req = createReq("de-DE,de;q=0.9,en;q=0.8") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.lang).toBe("de");
  });

  it("falls back to en for unsupported language (ja)", () => {
    const req = createReq("ja") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.lang).toBe("en");
  });

  it("falls back to en when Accept-Language is missing", () => {
    const req = createReq() as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.lang).toBe("en");
  });

  it("falls back to en when Accept-Language is an array (proxy edge case)", () => {
    const req = createReq(["de", "fr"]) as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.lang).toBe("en");
  });

  it("attaches a callable req.t", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(typeof req.t).toBe("function");
  });

  it("translates a known key in DE", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.t!("Vendor not found")).toBe("Anbieter nicht gefunden");
  });

  it("translates a known key in FR", () => {
    const req = createReq("fr") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.t!("Vendor not found")).toBe("Fournisseur introuvable");
  });

  it("returns the key unchanged when translation is missing (graceful fallback)", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    const unknownKey = "__definitely_not_in_dict_" + Math.random();
    expect(req.t!(unknownKey)).toBe(unknownKey);
  });

  it("interpolates {placeholder} vars", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.t!("Step {n} name is required", { n: 3 })).toBe("Schritt 3: Name ist erforderlich");
  });

  it("leaves {placeholder} literal when no matching var is provided", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.t!("Step {n} name is required")).toBe("Schritt {n}: Name ist erforderlich");
  });

  it("handles strings without any vars", () => {
    const req = createReq("de") as Request;
    i18nMiddleware(req, {} as Response, jest.fn() as NextFunction);
    expect(req.t!("Access denied")).toBe("Zugriff verweigert");
  });
});
