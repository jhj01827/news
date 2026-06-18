'use client';

import { useState, useEffect } from 'react';
import { Article } from '@/lib/types';
import { isBookmarked, toggleCollection } from '@/lib/collection';

interface Props {
  article: Article;
  /** 스크롤 여부 — 헤더 배경이 어두워졌을 때 버튼 배경 전환용 */
  isScrolled?: boolean;
  variant?: 'circle' | 'wide';
}

export default function BookmarkButton({ article, isScrolled = false, variant = 'circle' }: Props) {
  const [saved, setSaved] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const checkBookmark = () => {
      setSaved(isBookmarked(article.id));
    };

    checkBookmark();
    window.addEventListener('collection-change', checkBookmark);
    return () => {
      window.removeEventListener('collection-change', checkBookmark);
    };
  }, [article.id]);

  const handleToggle = () => {
    const next = toggleCollection(article);
    setSaved(next);
    setAnimate(true);
    setTimeout(() => setAnimate(false), 300);

    // 다른 북마크 버튼의 상태를 실시간 동기화하기 위해 이벤트 발생
    window.dispatchEvent(new Event('collection-change'));
  };

  if (variant === 'wide') {
    return (
      <button
        onClick={handleToggle}
        aria-label={saved ? '컬렉션에서 제거' : '컬렉션에 저장'}
        style={{
          width: '100%',
          height: '42px',
          borderRadius: '21px',
          background: saved ? 'var(--text-primary)' : 'rgba(255,255,255,0.06)',
          border: saved ? 'none' : '0.5px solid var(--border)',
          color: saved ? 'var(--bg)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          transform: animate ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 0.2s ease, background 0.25s ease, color 0.25s ease',
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span>{saved ? '컬렉션 저장됨' : '컬렉션 저장'}</span>
      </button>
    );
  }

  const btnBg = saved
    ? 'rgba(240,237,230,0.9)'
    : 'rgba(0,0,0,0.4)';

  const iconColor = saved ? '#0A0A0F' : '#F0EDE6';

  return (
    <button
      onClick={handleToggle}
      aria-label={saved ? '컬렉션에서 제거' : '컬렉션에 저장'}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: btnBg,
        border: '0.5px solid rgba(255,255,255,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        transform: animate ? 'scale(1.2)' : 'scale(1)',
        transition: 'transform 0.2s ease, background 0.25s ease',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={saved ? '#0A0A0F' : 'none'}
        stroke={iconColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
