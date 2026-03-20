import React from 'react';
import { ChevronLeft, ArrowRight, FileText, Rocket, Shield, AlertTriangle, Brain, Settings, Plug, GraduationCap, BarChart3, FlaskConical, ScanSearch, EyeOff, Router, LucideIcon } from 'lucide-react';
import { Collection, IconName } from '@user-guide-content/userGuideConfig';

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
import './CollectionPage.css';

interface CollectionPageProps {
  collection: Collection;
  onBack?: () => void;
  onArticleClick: (articleId: string) => void;
}

const CollectionPage: React.FC<CollectionPageProps> = ({
  collection,
  onBack,
  onArticleClick,
}) => {
  const IconComponent = iconMap[collection.icon];

  return (
    <div style={{ minHeight: '100%', backgroundColor: colors.background.alt }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: colors.background.white,
          borderBottom: border.default,
          padding: `${spacing.xl} ${spacing['3xl']}`,
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Breadcrumb - only shown when onBack is provided (web version) */}
          {onBack && (
            <div
              onClick={onBack}
              className="back-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
                marginBottom: '20px',
              }}
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
              <span>All collections</span>
            </div>
          )}

          {/* Collection Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <IconComponent size={24} strokeWidth={1.5} color={colors.brand.primary} style={{ marginTop: 4 }} />
            <div>
              <h1
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize['3xl'],
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                  marginTop: 0,
                }}
              >
                {collection.title}
              </h1>
              <p
                style={{
                  fontFamily: typography.fontFamily.sans,
                  fontSize: typography.fontSize.base,
                  color: colors.text.primary,
                  lineHeight: typography.lineHeight.normal,
                  margin: 0,
                }}
              >
                {collection.description}
              </p>
              <span
                style={{
                  display: 'block',
                  fontSize: typography.fontSize.sm,
                  color: colors.text.muted,
                  marginTop: spacing.sm,
                }}
              >
                {collection.articleCount} articles in this collection
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: `${spacing['2xl']} ${spacing['3xl']}` }}>
        <div
          style={{
            backgroundColor: colors.background.white,
            border: border.default,
            borderRadius: border.radius,
            overflow: 'hidden',
          }}
        >
          {collection.articles.map((article, index) => (
            <div
              key={article.id}
              onClick={() => onArticleClick(article.id)}
              className="article-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.lg,
                borderBottom: index < collection.articles.length - 1 ? border.default : 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
                <FileText size={16} strokeWidth={1.5} color={colors.text.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: typography.fontFamily.sans,
                      fontSize: typography.fontSize.base,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.primary,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {article.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: typography.fontFamily.sans,
                      fontSize: typography.fontSize.base,
                      color: colors.text.primary,
                      lineHeight: typography.lineHeight.normal,
                    }}
                  >
                    {article.description}
                  </span>
                </div>
              </div>
              <ArrowRight
                className="arrow-icon"
                size={16}
                strokeWidth={1.5}
                color={colors.text.muted}
                style={{
                  flexShrink: 0,
                  marginLeft: 16,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollectionPage;
