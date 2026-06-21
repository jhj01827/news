'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Article } from '@/lib/types';
import { getCategoryEmoji } from './CategoryFallback';
import { trackEvent } from '@/lib/mixpanel';

interface Props {
  article: Article;
  index: number;
  category: string;
}

export default function FeedCard({ article, index, category }: Props) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const emoji = getCategoryEmoji(article.category);

  const handleClick = () => {
    trackEvent('Article Clicked', {
      category: article.category,
      title: article.hook_title,
    });
    sessionStorage.setItem('brief_scroll', String(window.scrollY));
    sessionStorage.setItem('brief_cat', category);
    router.push(`/feed/${article.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={article.hook_title}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{
        position: 'relative',
        aspectRatio: '4 / 5',
        overflow: 'hidden',
        background: 'var(--card)',
        borderRadius: 12,
        cursor: 'pointer',
        display: 'block',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* 이미지 */}
      {!imgError && article.image_url ? (
        <img
          src={article.image_url}
          alt={article.hook_title}
          loading={index < 4 ? 'eager' : 'lazy'}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          background: 'var(--card)',
        }}>
          {emoji}
        </div>
      )}

      {/* 그라디언트 오버레이 */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '65%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* 텍스트 컨테이너 (칩 + 헤드라인) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'none',
      }}>
        {/* 키워드 칩 행 */}
        {article.keywords && article.keywords.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
          }}>
            {article.keywords.map((kw, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '20px',
                }}
              >
                #{kw}
              </span>
            ))}
          </div>
        )}

        {/* 헤드라인 */}
        <p style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.5,
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
