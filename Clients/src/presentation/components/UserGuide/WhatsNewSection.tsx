import React, { useRef, useState, useEffect, useCallback } from 'react';
import { colors, typography, spacing, border } from './styles/theme';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  items: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v2.2',
    date: 'April 2, 2026',
    title: 'AI Gateway, Policy Radar, and CI/CD scanning',
    summary:
      'Major release introducing the AI Gateway for centralized LLM traffic control with guardrails, spend tracking, and virtual keys. Adds Policy Radar for automated vendor policy monitoring, incremental AI detection scans, GitHub webhook CI/CD integration, super admin management, and intake form builder for use case registration.',
    items: [
      'AI Gateway — proxy all LLM traffic through a single control plane with spend dashboards, request/response logging, and per-endpoint analytics',
      'AI Gateway guardrails — PII detection (Presidio) and content filtering with block/mask actions on any endpoint',
      'AI Gateway virtual keys — scoped API keys with model/provider access controls and budget limits',
      'AI Gateway prompt library — save, version, and reuse prompt templates across endpoints',
      'Incremental AI detection scans — scan only changed files between two commits, carrying forward baseline findings',
      'GitHub webhook CI/CD integration — trigger AI detection scans automatically on push events with status reporting',
      'Super admin panel — manage organizations, users, and platform settings across all tenants',
      'Intake form builder — create custom use case registration forms with public submission links',
    ],
  },
  {
    version: 'v2.1',
    date: 'February 19, 2026',
    title: 'Shadow AI, agent discovery, and bias audits',
    summary:
      'Major release introducing Shadow AI detection for discovering unauthorized AI tool usage, an AI agent discovery and inventory system, law-aware bias audits for LLM evaluations, self-hosted scorer and judge support, and a plugin ecosystem expansion with Jira integration and dataset bulk upload.',
    items: [
      'Shadow AI detection module — discover unauthorized AI tool usage across the organization',
      'AI agent discovery and inventory — catalog and monitor AI agents org-wide',
      'Law-aware bias audit module for LLM evaluations',
      'Self-hosted local LLM scorer support (e.g. Ollama)',
      'Self-hosted judge provider and saved model dropdowns for evals',
      'GRS judge scoring and leaderboard aggregation',
      'Resumable multi-model inference with OpenRouter and audit manifests',
      'Jira integration plugin',
      'Model inventory lifecycle plugin',
      'Dataset bulk upload plugin',
      'AI detection extended to workflows, containers, and configs',
      'Lifecycle initialization in Shadow AI governance wizard',
      'Pending invitations table in team settings',
      'Configurable API key expiration',
      'Release notes tab in right sidebar and user menu',
    ],
  },
  {
    version: 'v2.0',
    date: 'February 6, 2026',
    title: 'Plugin marketplace and notifications',
    summary:
      'Major release introducing a plugin marketplace for extensibility, a virtual file manager with tag-like folder behavior, real-time notifications via SSE, and dataset inventory for EU AI Act Article 10 compliance.',
    items: [
      'Plugin marketplace with install/uninstall and generic execute endpoint',
      'Virtual file manager — hierarchical folders, multi-folder tagging, "All files" and "Uncategorized" views',
      'Real-time notification system with SSE, email integration, mark-as-read, and load-more pagination',
      'Dataset inventory — training, validation, testing, and production datasets with PII tracking and bias documentation',
      'Post-market monitoring module for EU AI Act compliance',
      'Governance score widget on dashboard',
      'Task deadline view with priority-colored flags and inline editing',
      'Unified upload component across modules',
      'Selectable cards to filter vendor risk tables',
    ],
  },
  {
    version: 'v1.9',
    date: 'January 15, 2026',
    title: 'Entity graph and AI detection',
    summary:
      'Introduces an interactive entity graph for visualizing relationships between models, risks, vendors, and controls. Adds a code-scanning AI detection module, an AI-powered governance advisor, and an LLM evaluation arena for model comparison.',
    items: [
      'Entity graph — interactive visualization of model, risk, vendor, and control relationships',
      'AI detection module — scans repositories to identify AI-generated content',
      'Governance advisor — AI chat providing contextual compliance and risk guidance',
      'LLM evaluation arena — run experiments, compare models, and measure performance metrics',
      'Multi-tenancy with schema-per-tenant isolation',
      'Redesigned dashboard with executive and operations views',
      'Policy export to PDF and Word formats',
    ],
  },
  {
    version: 'v1.8',
    date: 'December 19, 2025',
    title: 'LLM evals module and docs sidebar',
    summary:
      'Adds a dedicated LLM evaluation module with project dashboards and dataset management. Introduces the in-app documentation sidebar, activity history tracking across all modules, and a rich text policy editor with image and table support.',
    items: [
      'LLM evals module with project overview stats, grouping, and tenant-aware datasets',
      'In-app user guide sidebar with search, breadcrumbs, and navigation history',
      'Activity history tracking for vendor risks, vendors, policies, incidents, use cases, and project risks',
      'Rich text policy editor with image and table support (PlateJS)',
      'Reporting system with native DOCX generation and PDF export',
      'App switcher sidebar for multi-module navigation',
      'Modern tabular structure for ISO 42001, ISO 27001, and EU AI Act frameworks',
      'Stricter TypeScript compiler options enabled',
    ],
  },
  {
    version: 'v1.7',
    date: 'December 3, 2025',
    title: 'Model versioning and compliance frameworks',
    summary:
      'Adds model versioning to track description changes over time, NIST AI RMF framework support with risk linking, and CE marking for EU AI Act compliance. Introduces Wise Search for app-wide search and a user onboarding wizard.',
    items: [
      'Model versioning — view historical changes to model descriptions',
      'NIST AI RMF framework with function breakdown dashboard and risk linking',
      'CE marking workflow for EU AI Act compliance',
      'Wise Search — app-wide search across all modules',
      'User onboarding wizard for first-time setup',
      'Kubernetes deployment support',
      'Table export, print, and advanced GroupBy and Filter functionality',
      'Vendor icons auto-fetched from BrandFetch',
      'Geist font with Inter fallback adopted app-wide',
    ],
  },
  {
    version: 'v1.6.4',
    date: 'November 17, 2025',
    title: 'IBM AI Risk database and organization projects',
    summary:
      'Integrates the IBM AI Risk database, adds organization-level project creation, and includes report interface improvements and demo data fixes.',
    items: [
      'IBM AI Risk database integration for enriched risk intelligence',
      'Organization-level project creation workflow',
      'Report interfaces and data type improvements',
      'Use case and demo data bug fixes',
    ],
  },
  {
    version: 'v1.6.1',
    date: 'November 4, 2025',
    title: 'MLflow integration and file uploads',
    summary:
      'Brings MLflow integration for experiment tracking, Ollama support for local LLM inference in the bias and fairness module, and a mega dropdown menu for quick entity creation across modules.',
    items: [
      'MLflow integration for experiment tracking',
      'File manager with upload support in evidence modules',
      'Ollama support for local model inference (bias and fairness)',
      'Reporting automations for scheduled and on-demand reports',
      'Mega dropdown menu for quick entity creation',
      'Standardized form modals with consistent design system',
      'Model-project and model-framework linking',
      'Count badges on tab labels',
      'Geography field for use cases',
    ],
  },
  {
    version: 'v1.6',
    date: 'October 28, 2025',
    title: 'Automations and integrations hub',
    summary:
      'Introduces a full automations module with drawer-based creation, update, and delete workflows. Adds a dedicated integrations hub with Slack connectivity and a new AI incident management module built for EU AI Act compliance.',
    items: [
      'Automations module — drawer UI for creating, updating, and deleting workflow rules',
      'Integrations hub with dashboard buttons for Slack and third-party tools',
      'AI incident management — structured incident tracking with evidence linkage for EU AI Act',
      'Bias and fairness module backend logic and redesigned UI',
      'Improved report selection component with module-level filtering',
      'Revamped dashboard layout with better spacing and navigation links',
      'Unified sidebar behavior — no more shrink on browser resize',
    ],
  },
  {
    version: 'v1.5',
    date: 'October 14, 2025',
    title: 'UI overhaul and enterprise auth',
    summary:
      'A major UI refresh with ~40 merged PRs — complete icon migration to Lucide React, reusable EmptyState component, command palette with keyboard navigation, and enterprise SSO via Microsoft Azure AD (EntraID).',
    items: [
      'Microsoft Azure AD (EntraID) single sign-on integration',
      'API keys management interface',
      'Framework dashboard with analytics and tabbed navigation',
      'Slack connectivity for notifications',
      'PlateJS rich text editor for policy management',
      'Command palette with keyboard navigation',
      'Complete SVG icon migration to Lucide React — removed @mui/icons-material',
      'Reusable EmptyState component and standardized table backgrounds',
      'Terminology update: "Project" renamed to "Use case" throughout the app',
      'Bundle size optimized through icon migration',
    ],
  },
  {
    version: 'v1.4',
    date: 'September 24, 2025',
    title: 'Task management and model risk',
    summary:
      'Adds a full task management page for project and compliance tracking, completes model risk management with Swagger API documentation, and introduces fairness metric visualizations for bias assessments.',
    items: [
      'Task management page with assignment workflow and compliance tracking',
      'Model risk management completed with full API documentation in Swagger',
      'Fairness metric visualizations for bias assessments',
      'Deployment and session management system',
      'Event tracker enabled for OSS builds',
      'Training API endpoints added to Swagger',
      'Redesigned sidebar and helper drawer for clarity',
      'Search and pagination improvements across modules',
    ],
  },
  {
    version: 'v1.2.2',
    date: 'August 26, 2025',
    title: 'Vendor risk refactor and Redux migration',
    summary:
      'Restructures and expands vendor risk management, migrates state management to Redux for a single source of truth, and adds project dashboard improvements including search and card/table toggle with persistence.',
    items: [
      'Vendor risk repository refactored and expanded',
      'Redux state management migration — single source of truth',
      'Bias and fairness module unit tests',
      'Project dashboard — search, card/table toggle with localStorage persistence',
      'Risk visualization enhancements for project risks',
      'Model inventory — separated provider and model fields with migration',
      'Organization logo support in settings',
      'TanStack Query adopted on AI Trust Center page',
    ],
  },
];

const WhatsNewSection: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentVersion, setCurrentVersion] = useState(CHANGELOG[0].version);
  const [showStickyBar, setShowStickyBar] = useState(false);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    setShowStickyBar(scrollTop > 40);

    // Find which card is currently most visible at the top
    for (let i = 0; i < cardRefs.current.length; i++) {
      const card = cardRefs.current[i];
      if (!card) continue;
      const rect = card.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = rect.top - containerRect.top;
      if (relativeTop > -rect.height / 2) {
        setCurrentVersion(CHANGELOG[i].version);
        break;
      }
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const currentEntry = CHANGELOG.find((e) => e.version === currentVersion);

  return (
    <div
      ref={scrollContainerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {/* Sticky version bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: colors.background.white,
          borderBottom: border.default,
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: showStickyBar ? 1 : 0,
          transform: showStickyBar ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 150ms ease, transform 150ms ease',
          pointerEvents: showStickyBar ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            {currentVersion}
          </span>
          <span
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.xs,
              color: colors.text.muted,
            }}
          >
            {currentEntry?.date}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: `${spacing.md} ${spacing.xl} ${spacing.xl}` }}>
        <h2
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.sm,
            marginTop: 0,
          }}
        >
          What's new
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {CHANGELOG.map((entry, index) => (
            <div
              key={entry.version}
              ref={(el) => { cardRefs.current[index] = el; }}
              style={{
                backgroundColor: colors.background.white,
                border: border.default,
                borderRadius: border.radius,
                padding: spacing.lg,
              }}
            >
              {/* Date and version */}
              <div
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.base,
                  color: colors.text.muted,
                  marginBottom: spacing.sm,
                }}
              >
                {entry.date} &middot; {entry.version}
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.sm,
                }}
              >
                {entry.title}
              </div>

              {/* Summary */}
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.base,
                  color: colors.text.secondary,
                  lineHeight: typography.lineHeight.relaxed,
                  margin: 0,
                  marginBottom: spacing.md,
                }}
              >
                {entry.summary}
              </p>

              {/* Items */}
              <ul
                style={{
                  margin: 0,
                  paddingLeft: spacing.lg,
                  listStyle: 'disc',
                }}
              >
                {entry.items.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: typography.fontFamily.sans,
                      fontSize: typography.fontSize.base,
                      color: colors.text.secondary,
                      lineHeight: typography.lineHeight.relaxed,
                      paddingBottom: '2px',
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WhatsNewSection;
