'use client';

import { CATEGORIES, Category } from '@/lib/types';
import { trackEvent } from '@/lib/mixpanel';

interface Props {
  active: Category;
  onChange: (cat: Category) => void;
}

export default function CategoryTabs({ active, onChange }: Props) {
  return (
    <div className="tabs-scroll" style={{ padding: '10px 16px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className={`tab-pill${active === cat.key ? ' active' : ''}`}
            onClick={() => {
              onChange(cat.key);
              trackEvent('Category Filtered', { category: cat.key });
            }}
            aria-label={cat.label}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
