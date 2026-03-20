import React from 'react';
import { Search, ArrowRight, ExternalLink, Rocket, Shield, AlertTriangle, Brain, Settings, Plug, FileText, GraduationCap, BarChart3, FlaskConical, ScanSearch, EyeOff, Router, LucideIcon } from 'lucide-react';
import { collections, fastFinds, getCollection, IconName } from '@user-guide-content/userGuideConfig';

// Map icon names to actual Lucide components
const iconMap: Record<IconName, LucideIcon> = {
  Rocket,
  Shield,
  AlertTriangle,
  Brain,
  Settings,
  Plug,
  FileText,
  GraduationCap,
  BarChart3,
  FlaskConical,
  ScanSearch,
  EyeOff,
  Router,
};
import { colors, typography, spacing, border } from './styles/theme';
import './UserGuideLanding.css';

interface UserGuideLandingProps {
  onNavigate: (collectionId: string, articleId?: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  mode?: 'web' | 'in-app';
}

const UserGuideLanding: React.FC<UserGuideLandingProps> = ({
  onNavigate,
  searchQuery,
  onSearchChange,
  mode = 'web',
}) => {
  const isInApp = mode === 'in-app';
  return (
    <div style={{ minHeight: '100%', backgroundColor: colors.background.alt }}>
      {/* Hero Section - Only shown in web mode */}
      {!isInApp && (
        <div
          style={{
            background: `linear-gradient(135deg, ${colors.brand.primary} 0%, ${colors.brand.primaryDark} 100%)`,
            padding: `${spacing['4xl']} ${spacing['3xl']}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background pattern */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '50%',
              height: '100%',
              opacity: 0.1,
              background: `
                radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)
              `,
            }}
          />

          <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <h1
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize['5xl'],
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.white,
                marginBottom: spacing.sm,
                marginTop: 0,
                textAlign: 'center',
              }}
            >
              How can we help?
            </h1>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.base,
                color: colors.text.whiteMuted,
                marginBottom: spacing.xl,
                marginTop: 0,
                textAlign: 'center',
              }}
            >
              Search our knowledge base or browse collections below
            </p>

            {/* Search Bar */}
            <div
              style={{
                maxWidth: 600,
                margin: '0 auto',
                position: 'relative',
              }}
            >
              <Search
                size={16}
                strokeWidth={1.5}
                color={colors.text.muted}
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search for articles..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="search-input"
                style={{
                  width: '100%',
                  height: 48,
                  fontSize: typography.fontSize.base,
                  fontFamily: typography.fontFamily.sans,
                  backgroundColor: colors.background.white,
                  borderRadius: border.radius,
                  border: 'none',
                  paddingLeft: 44,
                  paddingRight: 16,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{
        maxWidth: isInApp ? '100%' : 1200,
        margin: '0 auto',
        padding: isInApp ? spacing.lg : `${spacing['3xl']} ${spacing['3xl']}`
      }}>
        {/* Collections Grid */}
        <h2
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: isInApp ? typography.fontSize.lg : typography.fontSize.xl,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: isInApp ? spacing.md : spacing.xl,
            marginTop: 0,
          }}
        >
          Browse by topic
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isInApp ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: isInApp ? spacing.md : spacing.lg,
            marginBottom: isInApp ? spacing.xl : spacing['4xl'],
          }}
        >
          {collections.map((collection) => {
            const IconComponent = iconMap[collection.icon];
            return (
              <div
                key={collection.id}
                onClick={() => onNavigate(collection.id)}
                className="collection-card"
                style={{
                  backgroundColor: colors.background.white,
                  border: border.default,
                  borderRadius: border.radius,
                  padding: spacing.lg,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
                  <IconComponent size={20} strokeWidth={1.5} color={colors.brand.primary} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                      <span
                        style={{
                          fontFamily: typography.fontFamily.sans,
                          fontSize: typography.fontSize.base,
                          fontWeight: typography.fontWeight.semibold,
                          color: colors.text.primary,
                        }}
                      >
                        {collection.title}
                      </span>
                      <span
                        style={{
                          fontSize: typography.fontSize.xs,
                          color: colors.text.secondary,
                          backgroundColor: colors.background.alt,
                          padding: '2px 6px',
                          borderRadius: border.radius,
                        }}
                      >
                        {collection.articleCount} articles
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: typography.fontFamily.sans,
                        fontSize: typography.fontSize.base,
                        color: colors.text.primary,
                        lineHeight: typography.lineHeight.normal,
                        display: 'block',
                      }}
                    >
                      {collection.description}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* About our docs - Only shown in in-app mode */}
        {isInApp && (
          <div
            style={{
              backgroundColor: colors.background.white,
              border: border.default,
              borderRadius: border.radius,
              padding: spacing.lg,
            }}
          >
            <h3
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                marginTop: 0,
              }}
            >
              About our docs
            </h3>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                lineHeight: typography.lineHeight.normal,
                margin: 0,
                marginBottom: spacing.md,
              }}
            >
              There are a few ways to explore our docs:
            </p>

            <div style={{ marginBottom: spacing.md }}>
              <h4
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                  marginTop: 0,
                }}
              >
                In the product
              </h4>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  color: colors.text.secondary,
                  lineHeight: typography.lineHeight.normal,
                  margin: 0,
                }}
              >
                Look for tooltips that link to docs - they open right inside the product.
              </p>
            </div>

            <div>
              <h4
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                  marginTop: 0,
                }}
              >
                On our website
              </h4>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  color: colors.text.secondary,
                  lineHeight: typography.lineHeight.normal,
                  margin: 0,
                }}
              >
                Search with the search icon at the top right, or browse by topic on the main user guide page.
              </p>
            </div>
          </div>
        )}

        {/* Fast Finds Section - Only shown in web mode */}
        {!isInApp && (
          <div
            style={{
              backgroundColor: colors.background.white,
              border: border.default,
              borderRadius: border.radius,
              padding: spacing.lg,
            }}
          >
            <h3
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.lg,
                marginTop: 0,
              }}
            >
              Popular articles
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: spacing.sm,
              }}
            >
              {fastFinds.map((item) => {
                const collection = getCollection(item.collectionId);
                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.collectionId, item.articleId)}
                    className="fast-find-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: border.radius,
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: typography.fontFamily.sans,
                          fontSize: typography.fontSize.base,
                          fontWeight: typography.fontWeight.medium,
                          color: colors.text.primary,
                          marginBottom: 2,
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: colors.text.muted,
                        }}
                      >
                        {collection?.title}
                      </span>
                    </div>
                    <ArrowRight
                      className="arrow-icon"
                      size={16}
                      strokeWidth={1.5}
                      color={colors.text.muted}
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* About our docs - Only shown in web mode */}
        {!isInApp && (
          <div
            style={{
              marginTop: spacing['2xl'],
              backgroundColor: colors.background.alt,
              borderRadius: border.radius,
              padding: spacing.xl,
            }}
          >
            <h3
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                marginTop: 0,
              }}
            >
              About our docs
            </h3>
            <p
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.base,
                color: colors.text.secondary,
                lineHeight: typography.lineHeight.normal,
                margin: 0,
                marginBottom: spacing.lg,
              }}
            >
              There are a few ways to explore our docs:
            </p>

            <div style={{ marginBottom: spacing.lg }}>
              <h4
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.base,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                  marginTop: 0,
                }}
              >
                On our website <span style={{ fontWeight: typography.fontWeight.normal, color: colors.text.muted }}>(You are here)</span>
              </h4>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  color: colors.text.secondary,
                  lineHeight: typography.lineHeight.normal,
                  margin: 0,
                }}
              >
                Search with the search bar above, or browse by topic. You can also ask a question at the end of each docs article.
              </p>
            </div>

            <div style={{ marginBottom: spacing.lg }}>
              <h4
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.base,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                  marginTop: 0,
                }}
              >
                In the product
              </h4>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.sm,
                  color: colors.text.secondary,
                  lineHeight: typography.lineHeight.normal,
                  margin: 0,
                }}
              >
                Look for tooltips that link to docs - they open right inside the product.
              </p>
            </div>

            {/* Contact and Community */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: spacing.md,
                marginTop: spacing.xl,
                paddingTop: spacing.lg,
                borderTop: border.default,
              }}
            >
              <div>
                <h4
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.base,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary,
                    marginBottom: spacing.xs,
                    marginTop: 0,
                  }}
                >
                  Contact us
                </h4>
                <p
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary,
                    lineHeight: typography.lineHeight.normal,
                    margin: 0,
                    marginBottom: spacing.md,
                  }}
                >
                  Can't find what you need? Our support team is here to help.
                </p>
                <a
                  href="mailto:support@verifywise.ai"
                  className="about-docs-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: `${spacing.sm} ${spacing.lg}`,
                    backgroundColor: colors.background.white,
                    border: border.default,
                    borderRadius: border.radius,
                    textDecoration: 'none',
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    color: colors.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  Email our support team
                </a>
              </div>
              <div>
                <h4
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.base,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary,
                    marginBottom: spacing.xs,
                    marginTop: 0,
                  }}
                >
                  Ask the community
                </h4>
                <p
                  style={{
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary,
                    lineHeight: typography.lineHeight.normal,
                    margin: 0,
                    marginBottom: spacing.md,
                  }}
                >
                  Questions about features, how-tos, or use cases?
                </p>
                <a
                  href="https://github.com/verifywise/verifywise/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="about-docs-button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                    padding: `${spacing.sm} ${spacing.lg}`,
                    backgroundColor: colors.background.white,
                    border: border.default,
                    borderRadius: border.radius,
                    textDecoration: 'none',
                    fontFamily: typography.fontFamily.sans,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    color: colors.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  Ask the community
                  <ExternalLink size={12} strokeWidth={1.5} color={colors.text.muted} />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserGuideLanding;
