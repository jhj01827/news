'use client';

import { useState, useEffect } from 'react';
import { Article } from '@/lib/types';
import { isBookmarked, toggleCollection } from '@/lib/collection';

interface Props {
  article: Article;
  /** 스크롤 여부 — 헤더 배경이 어두워졌을 때 버튼 배경 전환용 */
  isScrolled?: boolean;
}

export default function BookmarkButton({ article, isScrolled = false }: Props) {
  const [saved, setSaved] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setSaved(isBookmarked(article.id));
  }, [article.id]);

  const handleToggle = () => {
    const next = toggleCollection(article);
    setSaved(next);
    setAnimate(true);
    setTimeout(() => setAnimate(false), 300);
  };

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
