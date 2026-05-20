import React, { useState, useEffect, useCallback, useRef } from "react";
import { colors, border } from "./styles/theme";
import TabBar from "./TabBar";
import SidebarHeader from "./SidebarHeader";
import UserGuideLanding from "./UserGuideLanding";
import CollectionPage from "./CollectionPage";
import ArticlePage from "./ArticlePage";
import ContentRenderer from "./ContentRenderer";
import HelpSection from "./HelpSection";
import WhatsNewSection from "./WhatsNewSection";
import SearchResults from "./SearchResults";
import { getCollection, getArticle } from "@user-guide-content/userGuideConfig";
import { getArticleContent } from "@user-guide-content/content";
import { extractToc } from "@user-guide-content/contentTypes";
import { useUserGuideSidebarContext, DEFAULT_CONTENT_WIDTH } from "./UserGuideSidebarContext";
import AdvisorChat from "../AdvisorChat";
import {
  AdvisorDomain,
  isAdvisorEligiblePath,
  getDomainByPath,
} from "../AdvisorChat/advisorConfig";
import AdvisorHeader from "./AdvisorHeader";
import "./SidebarWrapper.css";

type Tab = "user-guide" | "advisor" | "help" | "whats-new";

interface SidebarWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  initialPath?: string; // e.g., "getting-started/quick-start"
  onOpenInNewTab?: () => void;
}

const STORAGE_KEY = "verifywise-sidebar-state";
const LLM_KEY_STORAGE_KEY = "verifywise-advisor-llm-key";
const MIN_CONTENT_WIDTH = DEFAULT_CONTENT_WIDTH;
const MAX_CONTENT_WIDTH = DEFAULT_CONTENT_WIDTH * 2; // 100% wider

const SidebarWrapper: React.FC<SidebarWrapperProps> = ({
  isOpen,
  onClose,
  onOpen,
  initialPath,
  onOpenInNewTab,
}) => {
  const {
    setContentWidth: setContextContentWidth,
    requestedTab,
    clearRequestedTab,
  } = useUserGuideSidebarContext();
  const [activeTab, setActiveTab] = useState<Tab>("user-guide");
  const [collectionId, setCollectionId] = useState<string | undefined>();
  const [articleId, setArticleId] = useState<string | undefined>();
  const [targetSectionId, setTargetSectionId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [contentWidth, setContentWidthLocal] = useState(DEFAULT_CONTENT_WIDTH);
  const [isAdvisorEnlarged, setIsAdvisorEnlarged] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [mouseY, setMouseY] = useState(0);
  const [selectedLLMKeyId, setSelectedLLMKeyId] = useState<number | undefined>(() => {
    // Initialize from localStorage to persist model selection across domains
    const savedKeyId = localStorage.getItem(LLM_KEY_STORAGE_KEY);
    return savedKeyId ? parseInt(savedKeyId, 10) : undefined;
  });
  const [hasLLMKeys, setHasLLMKeys] = useState<boolean | null>(null);
  const [isLoadingLLMKeys, setIsLoadingLLMKeys] = useState(true);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // Sync content width with context whenever it changes
  const setContentWidth = useCallback(
    (width: number) => {
      setContentWidthLocal(width);
      setContextContentWidth(width);
    },
    [setContextContentWidth],
  );

  // Handle LLM key change and persist to localStorage
  const handleLLMKeyChange = useCallback((keyId: number) => {
    setSelectedLLMKeyId(keyId);
    localStorage.setItem(LLM_KEY_STORAGE_KEY, keyId.toString());
  }, []);

  // Handle LLM keys loaded callback from AdvisorHeader
  const handleLLMKeysLoaded = useCallback((keysExist: boolean, loading: boolean) => {
    setHasLLMKeys(keysExist);
    setIsLoadingLLMKeys(loading);
  }, []);

  // Initialize context with current width on mount
  useEffect(() => {
    setContextContentWidth(DEFAULT_CONTENT_WIDTH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - intentionally excluding deps

  // Navigation history
  type HistoryEntry = { collectionId?: string; articleId?: string };
  const [history, setHistory] = useState<HistoryEntry[]>([
    { collectionId: undefined, articleId: undefined },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isNavigatingRef = useRef(false);

  // Check if advisor should be displayed for current path (configured in advisorConfig.ts)
  const displayAdvisor: boolean = isAdvisorEligiblePath(location.pathname);

  // Get the advisor domain context for current path
  const getAdvisorPageContext = (): AdvisorDomain | undefined => {
    return getDomainByPath(location.pathname);
  };

  // Parse initial path and switch to user-guide tab.
  // Path syntax: "collection/article" or "collection/article#sectionId".
  useEffect(() => {
    if (initialPath) {
      const [pathPart, section] = initialPath.split("#");
      const parts = pathPart.split("/");
      if (parts.length >= 1 && parts[0]) {
        setCollectionId(parts[0]);
        if (parts.length >= 2 && parts[1]) {
          setArticleId(parts[1]);
        }
      }
      setTargetSectionId(section || undefined);
      setActiveTab("user-guide");
    }
  }, [initialPath]);

  useEffect(() => {
    if (!displayAdvisor && activeTab === "advisor") {
      setActiveTab("user-guide");
    }
  }, [activeTab, displayAdvisor]);

  // React to external tab open requests (e.g. from SidebarFooter menu)
  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab as Tab);
      clearRequestedTab();
    }
  }, [requestedTab, clearRequestedTab]);

  // Persist sidebar state to localStorage
  useEffect(() => {
    if (isOpen) {
      const state = { activeTab, collectionId, articleId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [isOpen, activeTab, collectionId, articleId]);

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState && !initialPath) {
      try {
        const {
          activeTab: savedTab,
          collectionId: savedCollection,
          articleId: savedArticle,
        } = JSON.parse(savedState);
        if (savedTab) setActiveTab(savedTab);
        if (savedCollection) setCollectionId(savedCollection);
        if (savedArticle) setArticleId(savedArticle);
      } catch (_e) {
        // Ignore parse errors
      }
    }
  }, [initialPath]);

  // Track navigation changes in history
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    // Only track if this is a new navigation (not from back/forward)
    const currentEntry = history[historyIndex];
    if (currentEntry?.collectionId !== collectionId || currentEntry?.articleId !== articleId) {
      // Truncate forward history and add new entry
      const newHistory = [...history.slice(0, historyIndex + 1), { collectionId, articleId }];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [collectionId, articleId]);

  // Navigation handlers
  const handleNavigate = useCallback((newCollectionId: string, newArticleId?: string) => {
    setCollectionId(newCollectionId);
    setArticleId(newArticleId);
  }, []);

  const handleBackToHome = useCallback(() => {
    setCollectionId(undefined);
    setArticleId(undefined);
  }, []);

  // Back/Forward navigation
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const handleBack = useCallback(() => {
    if (historyIndex > 0) {
      isNavigatingRef.current = true;
      const prevIndex = historyIndex - 1;
      const prevEntry = history[prevIndex];
      setHistoryIndex(prevIndex);
      setCollectionId(prevEntry.collectionId);
      setArticleId(prevEntry.articleId);
    }
  }, [historyIndex, history]);

  const handleForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isNavigatingRef.current = true;
      const nextIndex = historyIndex + 1;
      const nextEntry = history[nextIndex];
      setHistoryIndex(nextIndex);
      setCollectionId(nextEntry.collectionId);
      setArticleId(nextEntry.articleId);
    }
  }, [historyIndex, history]);

  const handleBackToCollection = useCallback(() => {
    setArticleId(undefined);
  }, []);

  const handleHomeClick = useCallback(() => {
    setCollectionId(undefined);
    setArticleId(undefined);
  }, []);

  // Get current collection and article
  const collection = collectionId ? getCollection(collectionId) : undefined;
  const article = collectionId && articleId ? getArticle(collectionId, articleId) : undefined;

  // Get prev/next articles for navigation
  const getAdjacentArticles = () => {
    if (!collection || !articleId) return { prev: undefined, next: undefined };
    const currentIndex = collection.articles.findIndex((a) => a.id === articleId);
    return {
      prev: currentIndex > 0 ? collection.articles[currentIndex - 1] : undefined,
      next:
        currentIndex < collection.articles.length - 1
          ? collection.articles[currentIndex + 1]
          : undefined,
    };
  };

  const { prev: prevArticle, next: nextArticle } = getAdjacentArticles();

  // Get article content
  const articleContent =
    collectionId && articleId ? getArticleContent(collectionId, articleId) : undefined;

  // Auto-generate TOC from content headings
  const tocItems = articleContent ? extractToc(articleContent.blocks) : undefined;

  // Build breadcrumb items for dropdown
  const buildBreadcrumbs = () => {
    let items: { label: string; onClick: () => void }[] = [];
    switch (activeTab) {
      case "user-guide":
        items = [{ label: "User guide", onClick: handleHomeClick }];
        if (collection) {
          items.push({ label: collection.title, onClick: () => setArticleId(undefined) });
        }
        if (article) {
          items.push({ label: article.title, onClick: () => {} });
        }
        return items;
      case "advisor":
        return [{ label: "AI advisor", onClick: () => {} }];
      case "whats-new":
        return [{ label: "What's new", onClick: () => {} }];
      default:
        return [{ label: "Help", onClick: () => {} }];
    }
  };

  // Handle "Open in new tab"
  const handleOpenInNewTab = () => {
    let path = "https://verifywise.ai/user-guide";
    if (collectionId) {
      path += `/${collectionId}`;
      if (articleId) {
        path += `/${articleId}`;
      }
    }
    if (onOpenInNewTab) {
      onOpenInNewTab();
    } else {
      window.open(path, "_blank", "noopener,noreferrer");
    }
  };

  // Clear search and close search bar
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setIsSearchOpen(false);
  }, []);

  // Render User Guide content
  const renderUserGuideContent = () => {
    // Show search results when search is active
    if (isSearchOpen && searchQuery.trim().length > 0) {
      return (
        <SearchResults
          query={searchQuery}
          onNavigate={(colId, artId) => {
            handleNavigate(colId, artId);
            handleClearSearch();
          }}
          onClearSearch={handleClearSearch}
        />
      );
    }

    if (collection && article) {
      return (
        <ArticlePage
          collection={collection}
          article={article}
          onBack={handleBackToCollection}
          onBackToHome={handleBackToHome}
          prevArticle={prevArticle}
          nextArticle={nextArticle}
          onPrevArticle={
            prevArticle ? () => handleNavigate(collectionId!, prevArticle.id) : undefined
          }
          onNextArticle={
            nextArticle ? () => handleNavigate(collectionId!, nextArticle.id) : undefined
          }
          tocItems={tocItems}
          targetSectionId={targetSectionId}
          onSectionScrolled={() => setTargetSectionId(undefined)}
          mode="in-app"
        >
          {articleContent && (
            <ContentRenderer content={articleContent} onNavigate={handleNavigate} />
          )}
        </ArticlePage>
      );
    }

    if (collection) {
      return (
        <CollectionPage
          collection={collection}
          onArticleClick={(id) => handleNavigate(collectionId!, id)}
        />
      );
    }

    return (
      <UserGuideLanding
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        mode="in-app"
      />
    );
  };

  // Render Advisor content
  const renderAdvisorContent = () => {
    const context = getAdvisorPageContext();
    return (
      <AdvisorChat
        key={context}
        selectedLLMKeyId={selectedLLMKeyId}
        pageContext={context}
        hasLLMKeys={hasLLMKeys}
        isLoadingLLMKeys={isLoadingLLMKeys}
      />
    );
  };

  const contentArea = (tabValue: Tab) => {
    switch (tabValue) {
      case "user-guide":
        return renderUserGuideContent();
      case "advisor":
        return renderAdvisorContent();
      case "whats-new":
        return <WhatsNewSection />;
      default:
        return <HelpSection />;
    }
  };

  // Handle advisor enlarge toggle
  const handleToggleAdvisorEnlarge = useCallback(() => {
    setIsAdvisorEnlarged((prev) => {
      const next = !prev;
      const newWidth = next ? Math.round(DEFAULT_CONTENT_WIDTH * 1.4) : DEFAULT_CONTENT_WIDTH;
      setContentWidth(newWidth);
      return next;
    });
  }, [setContentWidth]);

  // Guard against rapid open/close during CSS transition
  const tabClickLockRef = useRef(false);

  // Handle tab click - open sidebar if closed, close if clicking active tab, or switch tab
  const handleTabClick = (tab: Tab) => {
    if (tabClickLockRef.current) return;
    tabClickLockRef.current = true;
    setTimeout(() => {
      tabClickLockRef.current = false;
    }, 350);

    if (!isOpen) {
      onOpen();
      setActiveTab(tab);
    } else if (activeTab === tab) {
      // Clicking the already-active tab closes the sidebar
      onClose();
    } else {
      // Clicking a different tab switches to it
      setActiveTab(tab);
      // Reset enlarge when switching away from advisor
      if (isAdvisorEnlarged) {
        setIsAdvisorEnlarged(false);
        setContentWidth(DEFAULT_CONTENT_WIDTH);
      }
    }
  };

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeRef.current = { startX: e.clientX, startWidth: contentWidth };
    },
    [contentWidth],
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;

      const deltaX = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(
        MAX_CONTENT_WIDTH,
        Math.max(MIN_CONTENT_WIDTH, resizeRef.current.startWidth + deltaX),
      );
      setContentWidth(newWidth);
    },
    [isResizing, setContentWidth],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setIsHoveringHandle(false);
    resizeRef.current = null;
  }, []);

  // Add/remove resize event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div
      className="sidebar-container"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        display: "flex",
        zIndex: 1100,
      }}
    >
      {/* Resize Handle - positioned absolutely on the left edge */}
      <div
        ref={handleRef}
        onMouseDown={handleResizeStart}
        onMouseEnter={() => setIsHoveringHandle(true)}
        onMouseLeave={() => !isResizing && setIsHoveringHandle(false)}
        onMouseMove={(e) => {
          if (handleRef.current) {
            const rect = handleRef.current.getBoundingClientRect();
            setMouseY(e.clientY - rect.top);
          }
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 4,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {/* Visual indicator line */}
        <div
          style={{
            width: isResizing ? 2 : 1,
            height: "100%",
            backgroundColor: isResizing || isHoveringHandle ? "#4CAF93" : colors.border.default,
            transition: isResizing ? "none" : "all 150ms ease",
            position: "relative",
          }}
        >
          {/* Grab indicator follows mouse */}
          {(isHoveringHandle || isResizing) && (
            <div
              style={{
                position: "absolute",
                left: -1,
                top: mouseY - 10,
                width: 3,
                height: 20,
                backgroundColor: "#555",
                borderRadius: 1,
              }}
            />
          )}
        </div>
      </div>

      {/* Tab Bar - Always visible */}
      <TabBar
        activeTab={isOpen ? activeTab : undefined}
        onTabChange={handleTabClick}
        displayAdvisor={displayAdvisor}
      />

      {/* Main Sidebar Content - Slides in/out */}
      <div
        style={{
          width: isOpen ? contentWidth : 0,
          height: "100%",
          backgroundColor: colors.background.white,
          borderLeft: isOpen ? border.default : "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: isResizing ? "none" : "width 300ms ease-in-out",
          position: "relative",
        }}
      >
        {isOpen && (
          <>
            {/* Header */}
            {activeTab === "advisor" ? (
              <AdvisorHeader
                onClose={onClose}
                selectedLLMKeyId={selectedLLMKeyId}
                onLLMKeyChange={handleLLMKeyChange}
                onLLMKeysLoaded={handleLLMKeysLoaded}
                isEnlarged={isAdvisorEnlarged}
                onToggleEnlarge={handleToggleAdvisorEnlarge}
              />
            ) : (
              <SidebarHeader
                showOpenInNewTab={activeTab === "user-guide"}
                showNavigation={activeTab === "user-guide"}
                breadcrumbs={buildBreadcrumbs()}
                onHomeClick={handleHomeClick}
                onBack={handleBack}
                onForward={handleForward}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onClose={onClose}
                onOpenInNewTab={handleOpenInNewTab}
                isSearchOpen={isSearchOpen}
                onSearchToggle={() => setIsSearchOpen(!isSearchOpen)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            )}

            {/* Content Area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                backgroundColor: colors.background.alt,
              }}
            >
              {contentArea(activeTab)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SidebarWrapper;
