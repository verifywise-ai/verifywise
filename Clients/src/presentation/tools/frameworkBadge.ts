/**
 * Framework name → badge asset lookup. Badges live in
 * `public/assets/badges/`. Returns null when no badge exists for the
 * given framework — callers should render a fallback icon.
 */
const FRAMEWORK_BADGE_SLUGS: Record<string, string> = {
  "EU AI Act": "eu_ai_act",
  "ISO 42001": "iso_42001",
  "ISO 27001": "iso_27001",
  "NIST AI RMF": "nist_ai_rmf",
  "SOC 2 Type II Framework": "soc2_type_ii",
  "GDPR Compliance Framework": "gdpr",
  "HIPAA Security Rule Framework": "hipaa",
  "CCPA Compliance Framework": "ccpa",
  "AI Ethics & Governance Framework": "ai_ethics",
  "ALTAI - Assessment List for Trustworthy AI": "altai",
  "Bahrain Personal Data Protection Law": "bahrain_pdpl",
  "CIS Controls v8": "cis_controls",
  "Colorado Artificial Intelligence Act Framework": "colorado_ai_act",
  "Data Governance Framework": "data_governance",
  "DORA Compliance Framework": "dora",
  "FTC AI Guidelines": "ftc_ai_guidelines",
  "NIST Cybersecurity Framework": "nist_csf",
  "NYC Local Law 144 - Automated Employment Decision Tools": "nyc_local_law_144",
  "OECD AI Principles": "oecd_ai_principles",
  "PCI-DSS Lite Framework": "pci_dss",
  "Qatar Personal Data Privacy Law": "qatar_pdpl",
  "Quebec Law 25 Compliance Framework": "quebec_law25",
  "Saudi Arabia Personal Data Protection Law": "saudi_pdpl",
  "Texas Responsible AI Governance Act Framework": "texas_ai_act",
  "UAE Personal Data Protection Law": "uae_pdpl",
};

export function getFrameworkBadgePath(frameworkName: string): string | null {
  const slug = FRAMEWORK_BADGE_SLUGS[frameworkName];
  return slug ? `/assets/badges/${slug}.svg` : null;
}
