/**
 * The OSFI E-23 formal report in report-pdf.ejs, rendered through the same
 * function the PDF is printed from (renderReportHtml), plus the guarantee that
 * a general report's HTML is unchanged by the E-23 work.
 */
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import { renderReportHtml } from "../pdfGenerator";
import { nonKindReportData } from "../tests/helpers/e23ReportData";

describe("report-pdf.ejs: general reports", () => {
  it("renders a non-kind report byte for byte as before the E-23 report existed", () => {
    // Recorded from the template before the E-23 blocks were added.
    expect(renderReportHtml(nonKindReportData())).toMatchSnapshot();
  });
});
