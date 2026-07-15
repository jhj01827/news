export type Category =
  | 'all'
  | 'tech'
  | 'beauty'
  | 'fashion'
  | 'retail'
  | 'culture'
  | 'meme';

export interface Article {
  id: string;
  category: Exclude<Category, 'all'>;
  hook_title: string;
  summary: string;
  background?: string | null;
  image_url: string | null;
  source_url: string;
  source_name: string | null;
  published_at: string;
  keywords?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: 'all',     label: '전체',   emoji: '🌐' },
  { key: 'tech',    label: '테크',   emoji: '💻' },
  { key: 'beauty',  label: '뷰티',   emoji: '💄' },
  { key: 'fashion', label: '패션',   emoji: '👗' },
  { key: 'retail',  label: '리테일', emoji: '🛍️' },
  { key: 'culture', label: '컬처',   emoji: '🌍' },
  { key: 'meme',    label: '밈',     emoji: '😂' },
];
