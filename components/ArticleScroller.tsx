'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Article } from '@/lib/types';
import { getCategoryEmoji } from './CategoryFallback';
import BookmarkButton from './BookmarkButton';
import AiPanel from './AiPanel';

interface Props {
  articles: Article[];
  initialId: string;
}

/* 개별 기사 아이템 — hooks를 루프 밖에서 사용하기 위해 분리 */
function ArticleItem({
  article,
  index,
  startIndex,
  dataIndex,
  isActive,
}: {
  article: Article;
  index: number;
  startIndex: number;
  dataIndex: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const emoji = getCategoryEmoji(article.category);

  /* 스크롤 컨테이너의 scrollTop을 감지하여 헤더 배경 전환 */
  useEffect(() => {
    const item = itemRef.current;
    if (!item) return;

    const handleScroll = () => {
      setIsScrolled(item.scrollTop > 20);
    };

    item.addEventListener('scroll', handleScroll, { passive: true });
    return () => item.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={itemRef} className="article-snap-item fade-in-up" data-index={dataIndex}>
      {/* 스티키 헤더 — 투명 ↔ 블러 전환 */}
      <header
        style={{
          position: 'sticky',
          top: '0px',
          zIndex: 50,
          width: '100%',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        {/* 스크롤 시 흐릿한 어두운 배경 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          opacity: isScrolled ? 1 : 0,
          transition: 'opacity 0.3s ease',
          zIndex: -1,
          pointerEvents: 'none',
        }} />
        {/* 상단 미스크롤 시 어두운 그라데이션 오버레이 (BeReal 스타일) */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(10,10,15,0.8) 0%, transparent 100%)',
          opacity: isScrolled ? 0 : 1,
          transition: 'opacity 0.3s ease',
          zIndex: -2,
          pointerEvents: 'none',
        }} />
        {/* 헤더 하단 그라데이션 페이드 */}
        <div style={{
          position: 'absolute',
          bottom: -24,
          left: 0,
          right: 0,
          height: 24,
          background: isScrolled
            ? 'linear-gradient(to bottom, rgba(10,10,15,0.85) 0%, transparent 100%)'
            : 'linear-gradient(to bottom, rgba(10,10,15,0.6) 0%, transparent 100%)',
          transition: 'background 0.3s ease',
          zIndex: -1,
          pointerEvents: 'none',
        }} />

        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => router.back()}
          aria-label="피드로 돌아가기"
          style={{
            position: 'relative',
            zIndex: 1,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.4)',
            border: '0.5px solid rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F0EDE6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 북마크 버튼 */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <BookmarkButton article={article} isScrolled={isScrolled} />
        </div>
      </header>

      {/* 커버 이미지 — marginTop으로 헤더와 자연스럽게 겹치게 */}
      <div className="detail-cover" style={{ marginTop: -56 }}>
        {!imgError && article.image_url ? (
          <img
            src={article.image_url}
            alt={article.hook_title}
            loading={index === startIndex ? 'eager' : 'lazy'}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="feed-card-fallback"
            style={{ height: '100%', fontSize: 40 }}
          >
            {emoji}
          </div>
        )}
        <div className="detail-cover-overlay" />
      </div>

      {/* 본문 */}
      <div className="detail-body" style={{ paddingBottom: 110 }}>
        {/* 메타 태그 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="meta-tag" style={{ fontSize: 12 }}>
            {emoji} {article.category.toUpperCase()}
          </span>
          {article.source_name && (
            <span className="meta-tag" style={{ fontSize: 12 }}>
              {article.source_name}
            </span>
          )}
          <span className="meta-tag" style={{ fontSize: 12 }}>
            {new Date(article.published_at).toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>

        {/* 제목 */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.45,
            letterSpacing: '-0.4px',
          }}
        >
          {article.hook_title}
        </h1>

        <div className="divider" />

        {/* 요약 본문 */}
        <p
          style={{
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--text-secondary)',
            lineHeight: 1.75,
          }}
        >
          {article.summary}
        </p>

        {/* 액션 버튼 그룹 (원문보기 + 컬렉션 저장) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
          width: '100%',
        }}>
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              height: 42,
              borderRadius: 21,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '0.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'background 0.2s ease',
            }}
          >
            원문 보기
          </a>
          <div style={{ flex: 1 }}>
            <BookmarkButton article={article} variant="wide" />
          </div>
        </div>

        <div className="divider" />

        {/* AI 패널 */}
        <AiPanel
          article={article}
          isActive={isActive}
        />
      </div>
    </div>
  );
}

/* 메인 스크롤러 */
export default function ArticleScroller({ articles, initialId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const initialIndex = Math.max(
    articles.findIndex((a) => a.id === initialId),
    0
  );

  // 초기 진입 시 해당 아이템으로 스크롤 (가로 스와이프이므로 left 방향으로 스크롤)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.children[initialIndex] as HTMLElement;
    if (target) {
      container.scrollTo({ left: target.offsetLeft, behavior: 'instant' });
    }
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  // IntersectionObserver로 현재 보이는 기사 URL & activeIndex 업데이트
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.boundingClientRect.width > 100) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            const id = articles[idx]?.id;
            if (id && window.location.pathname !== `/feed/${id}`) {
              window.history.replaceState(null, '', `/feed/${id}`);
            }
            setActiveIndex(idx);
          }
        });
      },
      { root: container, threshold: 0.5 }
    );

    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [articles]);

  return (
    <div ref={containerRef} className="article-scroller">
      {articles.map((article, idx) => (
        <ArticleItem
          key={article.id}
          article={article}
          index={idx}
          startIndex={initialIndex}
          dataIndex={idx}
          isActive={idx === activeIndex}
        />
      ))}
    </div>
  );
}
