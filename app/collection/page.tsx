'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Article, Category, CATEGORIES } from '@/lib/types';
import { getCollection, removeFromCollection } from '@/lib/collection';
import { getCategoryEmoji } from '@/components/CategoryFallback';

export default function CollectionPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeTab, setActiveTab] = useState<Category>('all');

  const loadCollection = () => {
    setArticles(getCollection());
  };

  useEffect(() => {
    loadCollection();
    // storage 이벤트로 다른 탭 동기화
    window.addEventListener('storage', loadCollection);
    return () => window.removeEventListener('storage', loadCollection);
  }, []);

  const handleDelete = (id: string) => {
    removeFromCollection(id);
    loadCollection();
  };

  const filtered =
    activeTab === 'all'
      ? articles
      : articles.filter((a) => a.category === activeTab);

  // 저장된 카테고리만 탭 표시
  const usedCategories = new Set(articles.map((a) => a.category));
  const visibleTabs = CATEGORIES.filter(
    (c) => c.key === 'all' || usedCategories.has(c.key as Exclude<Category, 'all'>)
  );

  return (
    <div style={{ paddingBottom: '88px' }}>
      {/* 헤더 */}
      <header style={{
        position: 'sticky',
        top: '0px',
        zIndex: 50,
        background: 'rgba(10,10,15,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <div style={{
          padding: '12px 16px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '48px',
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            내 컬렉션
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-disabled)', fontWeight: 400 }}>
            {articles.length}개 저장됨
          </span>
        </div>

        {/* 카테고리 탭 */}
        {articles.length > 0 && (
          <div className="tabs-scroll" style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {visibleTabs.map((cat) => (
                <button
                  key={cat.key}
                  className={`tab-pill${activeTab === cat.key ? ' active' : ''}`}
                  onClick={() => setActiveTab(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* 빈 상태 */}
      {articles.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3v-14a2 2 0 0 1 2-2" />
            </svg>
          </span>
          <p className="empty-state-text">
            아직 저장한 트렌드가 없어요.<br />
            기사를 읽고 북마크해보세요.
          </p>
          <Link href="/" className="btn-primary">
            피드 보러 가기
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🔍</span>
          <p className="empty-state-text">이 카테고리에 저장된 기사가 없어요.</p>
        </div>
      ) : (
        <div className="collection-list">
          {filtered.map((article) => {
            const emoji = getCategoryEmoji(article.category);
            return (
              <div key={article.id} style={{ position: 'relative' }}>
                <Link href={`/feed/${article.id}`} className="collection-card">
                  {/* 썸네일 */}
                  {article.image_url ? (
                    <img
                      src={article.image_url}
                      alt={article.hook_title}
                      className="collection-card-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="collection-card-img" style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      {emoji}
                    </div>
                  )}

                  {/* 본문 */}
                  <div className="collection-card-body">
                    <p className="collection-card-title">{article.hook_title}</p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="meta-tag">{emoji} {article.category.toUpperCase()}</span>
                      {article.source_name && (
                        <span className="collection-card-meta">{article.source_name}</span>
                      )}
                    </div>
                    <span className="collection-card-meta">
                      {new Date(article.published_at).toLocaleDateString('ko-KR', {
                        month: 'long', day: 'numeric',
                      })}
                    </span>
                  </div>
                </Link>

                {/* 삭제 버튼 */}
                <button
                  className="collection-delete-btn"
                  onClick={() => handleDelete(article.id)}
                  aria-label="저장 취소"
                  style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
