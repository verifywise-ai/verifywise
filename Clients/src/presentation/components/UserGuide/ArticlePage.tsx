import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Rocket, Shield, AlertTriangle, Brain, Settings, Plug, FileText, GraduationCap, BarChart3, FlaskConical, ScanSearch, EyeOff, Router, LucideIcon } from 'lucide-react';
import { Collection, Article, IconName } from '@user-guide-content/userGuideConfig';

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
import type { TocItem } from '@user-guide-content/contentTypes';
import { colors, typography, spacing, border } from './styles/theme';
import './ArticlePage.css';

type Mode = 'web' | 'in-app';

interface ArticlePageProps {
  collection: Collection;
  article: Article;
  onBack: () => void;
  onBackToHome: () => void;
  onNextArticle?: () => void;
  onPrevArticle?: () => void;
  nextArticle?: Article;
  prevArticle?: Article;
  tocItems?: TocItem[];
  children?: React.ReactNode;
  mode?: Mode;
}

const ArticlePage: React.FC<ArticlePageProps> = ({
  collection,
  article,
  onBack,
  onBackToHome,
  onNextArticle,
  onPrevArticle,
  nextArticle,
  prevArticle,
  tocItems,
  children,
  mode = 'web',
}) => {
  const IconComponent = iconMap[collection.icon];
  const isInApp = mode === 'in-app';
  const [activeSection, setActiveSection] = useState<string>('');

  // Track active section on scroll
  useEffect(() => {
    if (!tocItems || tocItems.length === 0) return;

    const handleScroll = () => {
      const sections = tocItems.map(item => {
        const id = item.href.replace('#', '');
        const element = document.getElementById(id);
        return { id: item.href, element };
      }).filter(s => s.element);

      if (sections.length === 0) return;

      let currentSection = sections[0].id;

      for (const section of sections) {
        if (section.element) {
          const rect = section.element.getBoundingClientRect();
          if (rect.top <= 150) {
            currentSection = section.id;
          }
        }
      }

      setActiveSection(currentSection);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [tocItems]);

  return (
    <div style={{ minHeight: '100%', backgroundColor: colors.background.alt }}>
      {/* Header - only shown in web mode */}
      {!isInApp && (
        <div
          style={{
            backgroundColor: colors.background.white,
            borderBottom: border.default,
            padding: `20px ${spacing['3xl']}`,
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
              <span
                onClick={onBackToHome}
                className="breadcrumb-link"
                style={{
                  color: colors.text.primary,
                  fontSize: typography.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                User guide
              </span>
              <ChevronRight size={14} strokeWidth={1.5} color={colors.text.muted} />
              <span
                onClick={onBack}
                className="breadcrumb-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: colors.text.primary,
                  fontSize: typography.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                <IconComponent size={14} strokeWidth={1.5} />
                {collection.title}
              </span>
              <ChevronRight size={14} strokeWidth={1.5} color={colors.text.muted} />
              <span
                style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                {article.title}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{ maxWidth: isInApp ? '100%' : 1100, margin: '0 auto', padding: isInApp ? spacing.lg : spacing['3xl'] }}>
        {/* Article Content */}
        <div style={{ maxWidth: isInApp ? '100%' : 680, minWidth: 0 }}>
          {/* Title */}
          <h1
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize['4xl'],
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.lg,
              lineHeight: typography.lineHeight.snug,
              marginTop: 0,
            }}
          >
            {article.title}
          </h1>

          {/* Description */}
          <p
            style={{
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.md,
              color: colors.text.primary,
              marginBottom: spacing.lg,
              lineHeight: typography.lineHeight.normal,
              marginTop: 0,
            }}
          >
            {article.description}
          </p>

          {/* Table of Contents - at top */}
          {tocItems && tocItems.length > 0 && (
            <div
              style={{
                marginBottom: spacing['2xl'],
                paddingBottom: isInApp ? 0 : spacing.lg,
                borderBottom: isInApp ? 'none' : border.default,
              }}
            >
              <div
                style={{
                  backgroundColor: isInApp ? '#f0f2f5' : 'transparent',
                  borderRadius: isInApp ? border.radius : 0,
                  padding: isInApp ? spacing.md : 0,
                  border: isInApp ? '1px solid #e0e3e8' : 'none',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary,
                    marginBottom: spacing.sm,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  In this article
                </span>
                <div style={{
                    display: 'flex',
                    flexDirection: isInApp ? 'column' : 'row',
                    flexWrap: isInApp ? 'nowrap' : 'wrap',
                    gap: isInApp ? 0 : spacing.xs,
                    columnGap: isInApp ? 0 : spacing.lg,
                  }}>
                  {tocItems.map((item) => {
                    const isActive = activeSection === item.href;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className="toc-link"
                        onClick={(e) => {
                          if (isInApp) {
                            e.preventDefault();
                            const id = item.href.replace('#', '');
                            const element = document.getElementById(id);
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }
                        }}
                        style={{
                          fontFamily: typography.fontFamily.sans,
                          fontSize: isInApp ? 13 : 12,
                          color: isActive ? colors.brand.primary : colors.text.secondary,
                          fontWeight: isActive ? typography.fontWeight.medium : typography.fontWeight.normal,
                          textDecoration: 'none',
                          padding: isInApp ? '2px 0' : `${spacing.xs} 0`,
                          paddingLeft: item.level === 3 ? spacing.md : 0,
                        }}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Article Body */}
          <div className="article-body">
            {children || (
              <div
                style={{
                  backgroundColor: colors.background.alt,
                  border: border.default,
                  borderRadius: border.radius,
                  padding: spacing.xl,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>
                  Article content coming soon.
                </span>
              </div>
            )}
          </div>

          {/* Navigation */}
          {(prevArticle || nextArticle) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: spacing['2xl'],
                paddingTop: spacing.xl,
                borderTop: border.default,
              }}
            >
              {prevArticle ? (
                <div
                  onClick={onPrevArticle}
                  className="nav-button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={16} strokeWidth={1.5} color={colors.text.muted} />
                  <div>
                    <span style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.muted }}>Previous</span>
                    <span
                      className="nav-text"
                      style={{
                        display: 'block',
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary,
                        fontWeight: typography.fontWeight.medium,
                      }}
                    >
                      {prevArticle.title}
                    </span>
                  </div>
                </div>
              ) : (
                <div />
              )}
              {nextArticle && (
                <div
                  onClick={onNextArticle}
                  className="nav-button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    textAlign: 'right',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.muted }}>Next</span>
                    <span
                      className="nav-text"
                      style={{
                        display: 'block',
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary,
                        fontWeight: typography.fontWeight.medium,
                      }}
                    >
                      {nextArticle.title}
                    </span>
                  </div>
                  <ChevronRight size={16} strokeWidth={1.5} color={colors.text.muted} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArticlePage;
