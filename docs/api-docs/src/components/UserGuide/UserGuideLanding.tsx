import React from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { collections, fastFinds, getCollection } from '@user-guide-content/userGuideConfig';
import { colors, typography, spacing, border } from '../../styles/theme';
import { resolveIcon } from './iconResolver';
import './UserGuideLanding.css';

interface UserGuideLandingProps {
  onNavigate: (collectionId: string, articleId?: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const UserGuideLanding: React.FC<UserGuideLandingProps> = ({
  onNavigate,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div style={{ minHeight: '100%', backgroundColor: colors.background.alt }}>
      {/* Hero Section */}
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

      {/* Main Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: `${spacing['3xl']} ${spacing['3xl']}` }}>
        {/* Collections Grid */}
        <h2
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.xl,
            marginTop: 0,
          }}
        >
          Browse by topic
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: spacing.lg,
            marginBottom: spacing['4xl'],
          }}
        >
          {collections.map((collection) => {
            const IconComponent = resolveIcon(collection.icon);
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
                  <IconComponent size={20} color={colors.brand.primary} />
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

        {/* Fast Finds Section */}
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
                        fontSize: typography.fontSize.xs,
                        color: colors.text.muted,
                      }}
                    >
                      {collection?.title}
                    </span>
                  </div>
                  <ArrowRight
                    className="arrow-icon"
                    size={16}
                    color={colors.text.muted}
                    style={{ flexShrink: 0 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserGuideLanding;
