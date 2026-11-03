/**
 * CSP (Content-Security-Policy) violation capture helper.
 *
 * Issue #4686-a. The VerifyWise client currently ships a
 * `Content-Security-Policy-Report-Only` header (see Clients/nginx.conf).
 * Browsers report violations in two ways and this helper captures both:
 *
 *   1. In-page `securitypolicyviolation` DOM events — captured via an init
 *      script installed BEFORE page load so early violations are not missed.
 *   2. Reporting-API / legacy `report-to` / `report-uri` POSTs — captured by
 *      intercepting any request that looks like a CSP report
 *      (content-type `application/csp-report` / `application/reports+json`,
 *      or a POST to a URL whose path contains "report"). The current nginx
 *      policy defines no report-uri/report-to endpoint, so today channel 1
 *      is the live one; channel 2 makes the helper future-proof for when a
 *      collector is added.
 *
 * The helper never fails a test by itself — it collects evidence. The
 * enforcement policy ("fail on any NEW violation directive") is implemented
 * by the aggregation step documented in docs/security/csp-evidence-pack.md.
 */

export interface CspViolation {
  /** Where the violation was observed from. */
  source: "securitypolicyviolation-event" | "report-api";
  /** Page URL at the time of the violation. */
  pageUrl: string;
  /** The effective directive that was violated (e.g. "script-src"). */
  violatedDirective: string;
  /** The blocked resource URI, if any. */
  blockedUri?: string;
  /** The document that triggered the violation, if reported. */
  documentUri?: string;
  /** "report" | "enforce" — always "report" while the header is Report-Only. */
  disposition?: string;
  /** Script/style source file, if reported. */
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  /** Full serialized report body for report-api captures. */
  raw?: unknown;
  /** ISO timestamp of capture. */
  capturedAt: string;
}

/** Payload the init script stores on `window`. */
interface CspWindowState {
  __cspViolations: CspViolation[];
}

declare global {
  interface Window {
    __cspViolations?: CspWindowState["__cspViolations"];
  }
}

export class CspCollector {
  readonly violations: CspViolation[] = [];
  private attached = false;
  private routeInstalled = false;

  /**
   * Install the in-page listener on the given page. Must be called BEFORE
   * the page navigates for the listener to catch early violations.
   */
  async attach(page: import("@playwright/test").Page): Promise<void> {
    await page.addInitScript(() => {
      window.__cspViolations = window.__cspViolations || [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__cspViolations!.push({
          source: "securitypolicyviolation-event",
          pageUrl: window.location.href,
          violatedDirective: event.violatedDirective,
          blockedUri: event.blockedURI || undefined,
          documentUri: event.documentURI || undefined,
          disposition: event.disposition || undefined,
          sourceFile: event.sourceFile || undefined,
          lineNumber: event.lineNumber || undefined,
          columnNumber: event.columnNumber || undefined,
          capturedAt: new Date().toISOString(),
        });
      });
    });
    this.attached = true;
  }

  /**
   * Intercept and record CSP report POSTs (report-uri / report-to /
   * Reporting API). Requests are acknowledged with 204 so the browser's
   * reporting queue is drained and no app errors occur.
   */
  async installReportEndpoint(page: import("@playwright/test").Page): Promise<void> {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const contentType = request.headers()["content-type"] ?? "";
      const looksLikeCspReport =
        request.method() === "POST" &&
        (/csp-report|reports\+json/.test(contentType) ||
          /\/reports?\b|csp/i.test(new URL(request.url()).pathname));
      if (!looksLikeCspReport) {
        await route.continue();
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(request.postData() ?? "{}");
      } catch {
        body = request.postData();
      }
      this.violations.push({
        source: "report-api",
        pageUrl: request.url(),
        violatedDirective:
          (body as Record<string, Record<string, string>>)?.["csp-report"]?.[
            "violated-directive"
          ] ??
          (body as Record<string, string>)?.["violated-directive"] ??
          "unknown",
        raw: body,
        capturedAt: new Date().toISOString(),
      });
      await route.fulfill({ status: 204 });
    });
    this.routeInstalled = true;
  }

  /**
   * Pull violations captured so far from the page's window state and merge
   * them (deduplicated) into this collector. Call after each navigation
   * or at the end of the test.
   */
  async collect(page: import("@playwright/test").Page): Promise<CspViolation[]> {
    if (!this.attached) {
      throw new Error("CspCollector.attach(page) must be called first");
    }
    const inPage = await page.evaluate(() => window.__cspViolations ?? []);
    for (const violation of inPage as CspViolation[]) {
      const key = `${violation.violatedDirective}|${violation.blockedUri ?? ""}|${violation.pageUrl}`;
      const already = this.violations.some(
        (v) => `${v.violatedDirective}|${v.blockedUri ?? ""}|${v.pageUrl}` === key,
      );
      if (!already) this.violations.push(violation);
    }
    return this.violations;
  }

  /** Distinct violated directives — the unit used by the enforcement policy. */
  violatedDirectives(): string[] {
    return [...new Set(this.violations.map((v) => v.violatedDirective.split(" ")[0]))].sort();
  }
}
