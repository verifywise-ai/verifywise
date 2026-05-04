/**
 * User Guide Components
 *
 * This module exports User Guide components for two modes:
 *
 * 1. Web Mode (verifywise.ai/user-guide)
 *    - Full standalone documentation with hero section
 *    - Uses UserGuideWrapper as the main entry point
 *
 * 2. In-App Mode (sidebar within VerifyWise app)
 *    - Sidebar documentation (360px) on the right side
 *    - Uses SidebarWrapper as the main entry point
 *    - Includes vertical tab bar (50px) with User Guide and Help tabs
 *
 * Usage:
 *
 * Web Mode:
 * ```tsx
 * import { UserGuideWrapper } from './components/UserGuide';
 *
 * <UserGuideWrapper
 *   collectionId={collectionId}
 *   articleId={articleId}
 *   onNavigate={(path) => navigate(path)}
 * />
 * ```
 *
 * In-App Mode:
 * ```tsx
 * import { SidebarWrapper, useUserGuideSidebar } from './components/UserGuide';
 *
 * const { isOpen, open, close } = useUserGuideSidebar();
 *
 * <SidebarWrapper
 *   isOpen={isOpen}
 *   onClose={close}
 *   initialPath="getting-started/quick-start"
 *   onOpenInNewTab={() => window.open('/resources/user-guide', '_blank')}
 * />
 * ```
 */

// Web mode components
export { default as UserGuideWrapper } from "./UserGuideWrapper";
export { default as UserGuideLanding } from "./UserGuideLanding";
export { default as CollectionPage } from "./CollectionPage";
export { default as ArticlePage } from "./ArticlePage";
export { default as ContentRenderer } from "./ContentRenderer";

// In-app mode components
export { default as SidebarWrapper } from "./SidebarWrapper";
export { default as TabBar } from "./TabBar";
export { default as SidebarHeader } from "./SidebarHeader";
export { default as HelpSection } from "./HelpSection";

// Configuration and content (from shared location)
export {
  collections,
  getCollection,
  getArticle,
  fastFinds,
} from "@user-guide-content/userGuideConfig";
export { getArticleContent } from "@user-guide-content/content";
export type { Collection, Article } from "@user-guide-content/userGuideConfig";
export type { ArticleContent, ContentBlock, TocItem } from "@user-guide-content/contentTypes";

// Hook for managing sidebar state
export { useUserGuideSidebar } from "./useUserGuideSidebar";

// Context for sharing sidebar state across components
export {
  UserGuideSidebarProvider,
  useUserGuideSidebarContext,
  TAB_BAR_WIDTH,
  DEFAULT_CONTENT_WIDTH,
  MIN_GAP,
} from "./UserGuideSidebarContext";
