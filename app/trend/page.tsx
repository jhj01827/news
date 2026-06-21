'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CategoryTabs from '@/components/CategoryTabs';
import { Category, Article } from '@/lib/types';
import { fetchAllArticles } from '@/lib/articles';
import { trackEvent } from '@/lib/mixpanel';

// ─── 태그 빈도 계산 ───────────────────────────────────────────────
interface TagData {
  keyword: string;
  count: number;
  category: Category;   // 해당 태그가 속한 첫 번째 카테고리
  articles: Article[];
}

// 전체 기사 기준으로 태그별 전체 카운트를 먼저 계산
function buildGlobalCountMap(allArticles: Article[]): Map<string, number> {
  const countMap = new Map<string, number>();
  for (const article of allArticles) {
    if (!article.keywords) continue;
    for (const kw of article.keywords) {
      countMap.set(kw, (countMap.get(kw) ?? 0) + 1);
    }
  }
  return countMap;
}

function buildTagData(filterCategory: Category, allArticles: Article[]): TagData[] {
  const globalCounts = buildGlobalCountMap(allArticles);
  const map = new Map<string, TagData>();

  // 표시할 태그는 선택된 카테고리 기사 기준
  const articles = filterCategory === 'all'
    ? allArticles
    : allArticles.filter((a) => a.category === filterCategory);

  for (const article of articles) {
    if (!article.keywords) continue;
    for (const kw of article.keywords) {
      if (map.has(kw)) {
        map.get(kw)!.articles.push(article);
      } else {
        map.set(kw, {
          keyword: kw,
          // 버블 크기는 전체 카테고리 기준 카운트 사용
          count: globalCounts.get(kw) ?? 1,
          category: article.category as Category,
          articles: [article],
        });
      }
    }
  }

  let result = Array.from(map.values()).sort((a, b) => b.count - a.count);

  // 전체(all) 탭에서는 기사 수가 많아 1개짜리 마이너한 키워드들이 화면을 가리는 현상을 방지하되,
  // 너무 비어 보이지 않도록 최소 10개 내외의 버블은 보장하여 노출합니다.
  if (filterCategory === 'all') {
    const mainTags = result.filter((tag) => tag.count >= 2);
    if (mainTags.length >= 10) {
      result = mainTags;
    } else {
      // 2개 이상 매칭되는 주요 태그가 10개 미만이면 전체 정렬 기준 상위 10개를 노출합니다.
      result = result.slice(0, 10);
    }
  }

  return result;
}

// ─── 버블 레이아웃 ───────────────────────────────────────────────
// 겹치지 않도록 미리 계산된 상대 위치 풀 (%)
const POSITIONS = [
  { top: 10, left: 8 },
  { top: 8,  left: 52 },
  { top: 14, left: 30 },
  { top: 26, left: 68 },
  { top: 30, left: 14 },
  { top: 36, left: 44 },
  { top: 48, left: 6 },
  { top: 46, left: 66 },
  { top: 52, left: 28 },
  { top: 62, left: 52 },
  { top: 64, left: 10 },
  { top: 70, left: 36 },
  { top: 76, left: 66 },
  { top: 20, left: 78 },
  { top: 40, left: 82 },
  { top: 58, left: 80 },
  { top: 72, left: 20 },
  { top: 16, left: 44 },
  { top: 82, left: 50 },
  { top: 84, left: 24 },
  { top: 6,  left: 70 },
  { top: 44, left: 28 },
  { top: 34, left: 60 },
  { top: 56, left: 44 },
];

// 3단계 고정 크기: large(3+개), medium(2개), small(1개)
function getBubbleSize(count: number) {
  if (count >= 3) return { size: 115, fontSize: 16, fontWeight: 700 };
  if (count === 2) return { size: 92, fontSize: 13.5, fontWeight: 600 };
  return { size: 70, fontSize: 11.5, fontWeight: 500 };
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export default function TrendMapPage() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('all');
  const [isScrolled, setIsScrolled] = useState(false);
  const [sheet, setSheet] = useState<TagData | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 드래그-다운 닫기
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current ?? window as unknown as Element;
    const handleScroll = () => setIsScrolled((el instanceof Window ? (el as unknown as Window).scrollY : (el as HTMLElement).scrollTop) > 20);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // sheet 열기 애니메이션
  useEffect(() => {
    if (sheet) {
      requestAnimationFrame(() => setSheetVisible(true));
    }
  }, [sheet]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => setSheet(null), 320);
  }, []);

  const handleBubbleClick = (tag: TagData) => {
    if (tag.articles.length === 0) return;
    trackEvent('Trend Bubble Clicked', { keyword: tag.keyword });
    setSheet(tag);
  };

  const [allArticles, setAllArticles] = useState<Article[]>([]);

  // 마운트 시 전체 기사 한 번만 fetch (카테고리 필터는 client-side)
  useEffect(() => {
    fetchAllArticles().then(setAllArticles);
  }, []);

  const tagData = buildTagData(category, allArticles);

  // 드래그 핸들러
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current !== null) {
      const diff = e.changedTouches[0].clientY - dragStart.current;
      if (diff > 60) closeSheet();
      dragStart.current = null;
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', minHeight: '100%', background: '#0A0A0F', position: 'relative', overflowX: 'hidden', paddingBottom: '96px' }}>

      {/* ── 스티키 헤더 ── */}
      <header style={{
        position: 'sticky',
        top: '0px',
        zIndex: 50,
        width: '100%',
        borderBottom: isScrolled ? '0.5px solid var(--border)' : 'none',
        transition: 'border-bottom 0.3s ease',
      }}>
        {/* blur 배경 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          opacity: isScrolled ? 1 : 0,
          transition: 'opacity 0.3s ease',
          zIndex: -1, pointerEvents: 'none',
        }} />
        {/* 상단 그라디언트 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(10,10,15,0.8) 0%, transparent 100%)',
          opacity: isScrolled ? 0 : 1,
          transition: 'opacity 0.3s ease',
          zIndex: -2, pointerEvents: 'none',
        }} />

        {/* 타이틀 — 왼쪽 정렬 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '12px 16px 4px',
          height: '48px',
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            TREND MAP
          </span>
        </div>

        <CategoryTabs active={category} onChange={(cat) => { setCategory(cat); containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); setIsScrolled(false); }} />
      </header>

      {/* ── 버블 영역 ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 170px)',
      }}>
        {tagData.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-disabled)', fontSize: 14 }}>
            이 카테고리에 키워드가 없습니다.
          </div>
        )}

        {tagData.slice(0, POSITIONS.length).map((tag, idx) => {
          const pos = POSITIONS[idx];
          const { size, fontSize, fontWeight } = getBubbleSize(tag.count);
          const floatClass = idx % 3 === 0 ? 'bubble-float' : idx % 3 === 1 ? 'bubble-float-delayed' : 'bubble-float-fast';

          return (
            <button
              key={tag.keyword}
              onClick={() => handleBubbleClick(tag)}
              className={floatClass}
              style={{
                position: 'absolute',
                top: `${pos.top}%`,
                left: `${pos.left}%`,
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '0.5px solid rgba(255,255,255,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize,
                fontWeight,
                textAlign: 'center',
                padding: '10px',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                transition: 'transform 0.2s ease, background 0.2s ease',
                lineHeight: 1.3,
                wordBreak: 'keep-all',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.border = '0.5px solid rgba(255,255,255,0.28)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.border = '0.5px solid rgba(255,255,255,0.14)';
              }}
            >
              {tag.keyword}
              {tag.count > 1 && (
                <span style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  {tag.count}
                </span>
              )}
            </button>
          );
        })}
      </div>



      {/* ── 바텀 시트 backdrop ── */}
      {sheet && (
        <div
          onClick={closeSheet}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            opacity: sheetVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* ── 바텀 시트 본체 ── */}
      {sheet && (
        <div
          ref={sheetRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 101,
            height: '62%',
            background: 'rgba(10,10,15,0.98)',
            borderRadius: '20px 20px 0 0',
            borderTop: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {/* 드래그 핸들 */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          </div>

          {/* 헤더 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px 12px',
            borderBottom: '0.5px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
              #{sheet.keyword}
            </span>
            <button
              onClick={closeSheet}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#ffffff',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* 카드 리스트 (스크롤 가능, 1열) */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sheet.articles.map((article) => (
                <SheetCard
                  key={article.id}
                  article={article}
                  onClick={() => {
                    trackEvent('Article Clicked', {
                      category: article.category,
                      title: article.hook_title,
                    });
                    closeSheet();
                    setTimeout(() => router.push(`/feed/${article.id}`), 50);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 바텀 시트 내 가로형 카드 (피드카드 스타일, 5:2 비율) ─────────────────
function SheetCard({ article, onClick }: { article: Article; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        position: 'relative',
        aspectRatio: '5 / 2',
        overflow: 'hidden',
        borderRadius: 12,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.05)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* 이미지 */}
      {!imgError && article.image_url ? (
        <img
          src={article.image_url}
          alt={article.hook_title}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
          📰
        </div>
      )}

      {/* 그라디언트 — 왼쪽에서 아두워져 텍스트 가독성 확보 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* 텍스트 오버레이 — 왼쪽 안쪽 상하 중앙 */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0, left: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '10px 14px',
        maxWidth: '68%',
        gap: 6,
      }}>
        {/* 키워드 칩 */}
        {article.keywords && article.keywords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {article.keywords.slice(0, 2).map((kw, i) => (
              <span key={i} style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 20,
              }}>
                #{kw}
              </span>
            ))}
          </div>
        )}
        <p style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.4,
          letterSpacing: '-0.2px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'keep-all',
          margin: 0,
        }}>
          {article.hook_title}
        </p>
      </div>
    </div>
  );
}

