/**
 * Every statutory reference the education content may cite.
 *
 * A reference not in this list fails the content test. The list exists so
 * that no provision is cited for a proposition it does not contain, which
 * would put a false statement of the law into a signed document.
 *
 * References stop at the level the rule text supports: "5-301(c)", never a
 * deeper sub-paragraph, and no worked example is cited.
 */
export const VALID_CITATIONS = [
  "5-300", // definitions: AEDT, independent auditor, test data, distribution date
  "5-301", // required calculations
  "5-301(a)", // one year since the most recent bias audit — the only re-audit trigger
  "5-301(b)", // selection branch
  "5-301(c)", // scoring branch
  "5-301(d)", // the 2% exclusion
  "5-302", // data requirements
  "5-302(a)", // must use historical data
  "5-302(b)", // test data permitted where historical data is insufficient
  "5-303", // publication, by the employer or employment agency
  "5-303(a)(2)", // distribution date
  "5-303(c)", // six-month posting
  "20-871", // Local Law 144 as codified
  "20-871(a)(1)",
  "20-871(b)", // candidate notice
  "FAQ III.4", // one audit may cover multiple positions
  "FAQ V.1", // the vendor that created the AEDT is not responsible for its audit
] as const;
