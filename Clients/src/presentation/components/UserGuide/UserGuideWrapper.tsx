import React from "react";
import UserGuideLanding from "./UserGuideLanding";
import CollectionPage from "./CollectionPage";
import ArticlePage from "./ArticlePage";
import ContentRenderer from "./ContentRenderer";
import { getCollection, getArticle } from "@user-guide-content/userGuideConfig";
import { getArticleContent } from "@user-guide-content/content";
import { extractToc } from "@user-guide-content/contentTypes";

interface UserGuideWrapperProps {
  collectionId?: string;
  articleId?: string;
  onNavigate: (path: string) => void;
}

const UserGuideWrapper: React.FC<UserGuideWrapperProps> = ({
  collectionId,
  articleId,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");

  // Navigate to a collection or article
  const handleNavigate = (newCollectionId: string, newArticleId?: string) => {
    if (newArticleId) {
      onNavigate(`/resources/user-guide/${newCollectionId}/${newArticleId}`);
    } else {
      onNavigate(`/resources/user-guide/${newCollectionId}`);
    }
  };

  // Navigate back to landing page
  const handleBackToHome = () => {
    onNavigate("/resources/user-guide");
  };

  // Navigate back to collection
  const handleBackToCollection = () => {
    if (collectionId) {
      onNavigate(`/resources/user-guide/${collectionId}`);
    }
  };

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

  // Get article content from the content system
  const articleContent =
    collectionId && articleId ? getArticleContent(collectionId, articleId) : undefined;

  // Auto-generate TOC from content headings
  const tocItems = articleContent ? extractToc(articleContent.blocks) : undefined;

  // Render appropriate page based on URL params
  if (collection && article) {
    // Article page
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
      >
        {articleContent && <ContentRenderer content={articleContent} onNavigate={handleNavigate} />}
      </ArticlePage>
    );
  }

  if (collection) {
    // Collection page
    return (
      <CollectionPage
        collection={collection}
        onBack={handleBackToHome}
        onArticleClick={(id) => handleNavigate(collectionId!, id)}
      />
    );
  }

  // Landing page
  return (
    <UserGuideLanding
      onNavigate={handleNavigate}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />
  );
};

export default UserGuideWrapper;
