'use client';

import { CATEGORIES } from '@/lib/types';

interface Props {
  emoji: string;
}

export function CategoryFallback({ emoji }: Props) {
  return (
    <div className="feed-card-fallback">
      <span>{emoji}</span>
    </div>
  );
}

export function getCategoryEmoji(category: string): string {
  const found = CATEGORIES.find((c) => c.key === category);
  return found?.emoji ?? '📰';
}
