import { Request, Response, NextFunction } from "express";
import { getTranslator, isSupportedLang, type SupportedLang } from "../utils/i18n.utils";

const parseHeaderLang = (headerValue: string | string[] | undefined): SupportedLang => {
  if (typeof headerValue !== "string") return "en";
  const tag = headerValue.split(",")[0]?.split("-")[0]?.toLowerCase();
  return isSupportedLang(tag) ? tag : "en";
};

export const i18nMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  req.lang = parseHeaderLang(req.headers["accept-language"]);
  req.t = getTranslator(req.lang);
  next();
};
