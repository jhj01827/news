'use client';

import { Article } from '@/lib/types';
import FeedCard from './FeedCard';
import SkeletonCard from './SkeletonCard';

interface Props {
  articles: Article[];
  loading: boolean;
  category: string;
  searchQuery?: string;
}

const GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '8px',
  padding: '0 16px',
  width: '100%',
  marginTop: '16px',
};

export default function FeedGrid({ articles, loading, category, searchQuery }: Props) {
  if (loading) {
    return (
      <div style={GRID_STYLE}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!loading && articles.length === 0) {
    const isSearchActive = searchQuery && searchQuery.trim() !== '';
    return (
      <div className="empty-state">
        <span className="empty-state-icon">{isSearchActive ? '🔍' : '📭'}</span>
        <p className="empty-state-text">
          {isSearchActive ? (
            <>
              검색 결과가 없어요.<br />다른 검색어로 시도해보세요.
            </>
          ) : (
            <>
              아직 이 카테고리에 트렌드가 없어요.<br />곧 업데이트될 예정이에요.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div style={GRID_STYLE}>
      {articles.map((article, i) => (
        <FeedCard
          key={article.id}
          article={article}
          index={i}
          category={category}
        />
      ))}
    </div>
  );
}
