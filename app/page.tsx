'use client';

import { useState, useEffect, useRef } from 'react';
import { Article, Category } from '@/lib/types';
import { fetchAllArticles, fetchArticlesByCategory } from '@/lib/articles';
import CategoryTabs from '@/components/CategoryTabs';
import FeedGrid from '@/components/FeedGrid';
import { trackEvent } from '@/lib/mixpanel';

// Bigram Jaccard Similarity Helper (Client-side Duplicate Prevention)
function getBigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/\s+/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.substring(i, i + 2));
  }
  return bigrams;
}

function getStringSimilarity(str1: string, str2: string): number {
  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  if (b1.size === 0 && b2.size === 0) return 1;
  if (b1.size === 0 || b2.size === 0) return 0;
  
  let intersection = 0;
  for (const val of b1) {
    if (b2.has(val)) intersection++;
  }
  return intersection / (b1.size + b2.size - intersection);
}

export default function FeedPage() {
  const [category, setCategory] = useState<Category>('all');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [allArticles, setAllArticles] = useState<Article[]>([]);

  // Feed Viewed 이벤트 트래킹
  useEffect(() => {
    trackEvent('Feed Viewed');
  }, []);

  // Search Used 이벤트 트래킹 (1초 디바운스)
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(() => {
      trackEvent('Search Used', { query: searchQuery });
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 카테고리 변경 시 Supabase에서 fetch → 검색은 client-side 필터링
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const data =
        category === 'all'
          ? await fetchAllArticles()
          : await fetchArticlesByCategory(category as Exclude<Category, 'all'>);

      if (!cancelled) {
        const uniqueArticles: Article[] = [];
        for (const art of data) {
          const isDuplicate = uniqueArticles.some(
            (existing) => getStringSimilarity(art.hook_title, existing.hook_title) >= 0.6
          );
          if (!isDuplicate) {
            uniqueArticles.push(art);
          }
        }
        setAllArticles(uniqueArticles);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [category]);

  // 검색 필터링 (fetch된 데이터 기반, client-side)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setArticles(allArticles);
      return;
    }
    const q = searchQuery.toLowerCase();
    setArticles(allArticles.filter((a) => a.hook_title.toLowerCase().includes(q)));
  }, [searchQuery, allArticles]);

  const [isScrolled, setIsScrolled] = useState(false);

  // 스크롤 감지 (BeReal 스타일 헤더를 위함 - 스크롤바가 app-container에 있으므로 이를 감지)
  useEffect(() => {
    const container = document.querySelector('.app-container');
    const handleScroll = () => {
      if (container) {
        setIsScrolled(container.scrollTop > 20);
      }
    };
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // 피드 복귀 시 스크롤 위치 복원 및 URL 쿼리 파라미터 파싱
  useEffect(() => {
    // 1. URL 쿼리 파라미터 체크 (트렌드 맵에서 리다이렉트 시 검색 처리)
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    const catParam = params.get('category') as Category | null;

    if (searchParam) {
      setSearchQuery(searchParam);
      setIsSearching(true);
      if (catParam) {
        setCategory(catParam);
      }
      // 깔끔한 URL 유지를 위해 쿼리 스트링 제거
      window.history.replaceState(null, '', '/');
      return;
    }

    // 2. 기존 세션 스토리지 기반 카테고리/스크롤 복원
    const savedCat = sessionStorage.getItem('brief_cat') as Category | null;
    const savedScroll = sessionStorage.getItem('brief_scroll');
    if (savedCat) {
      setCategory(savedCat);
      sessionStorage.removeItem('brief_cat');
    }
    if (savedScroll) {
      setTimeout(() => {
        const container = document.querySelector('.app-container');
        if (container) {
          container.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
          setIsScrolled(Number(savedScroll) > 20);
        }
        sessionStorage.removeItem('brief_scroll');
      }, 150);
    }
  }, []);

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    const container = document.querySelector('.app-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsScrolled(false);
  };

  return (
    <div ref={scrollRef} style={{ width: '100%', maxWidth: '100vw', paddingBottom: '88px' }}>
      {/* 스티키 헤더 */}
      <header style={{
        position: 'sticky',
        top: '0px',
        zIndex: 50,
        width: '100%',
      }}>
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
        {/* 헤더 하단 그라데이션 페이드 — 콘텐츠와 자연스럽게 연결 */}
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
        {/* 로고 행 / 검색 행 */}
        {isSearching ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px 4px',
            height: '48px',
          }}>
            <div style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}>
              <svg
                style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-disabled)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="트렌드 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: '12px',
                  padding: '8px 12px 8px 34px',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <button
              onClick={() => {
                setIsSearching(false);
                setSearchQuery('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              취소
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 4px',
            height: '48px',
          }}>
            <span style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px',
            }}>
              BRIEF
            </span>
            <button
              onClick={() => setIsSearching(true)}
              aria-label="검색 열기"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </div>
        )}

        {/* 카테고리 탭 */}
        <CategoryTabs active={category} onChange={handleCategoryChange} />
      </header>

      {/* 피드 그리드 */}
      <FeedGrid articles={articles} loading={loading} category={category} searchQuery={searchQuery} />
    </div>
  );
}
