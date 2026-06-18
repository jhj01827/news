import { notFound } from 'next/navigation';
import { MOCK_ARTICLES } from '@/lib/mockData';
import { Article } from '@/lib/types';
import ArticleScroller from '@/components/ArticleScroller';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = MOCK_ARTICLES.find((a) => a.id === id);
  return {
    title: article ? `${article.hook_title} — BRIEF` : 'BRIEF',
    description: article?.summary?.slice(0, 120),
  };
}

export default async function FeedDetailPage({ params }: Props) {
  const { id } = await params;

  const article = MOCK_ARTICLES.find((a) => a.id === id);
  if (!article) notFound();

  // 같은 카테고리 기사 — 현재 기사를 맨 앞으로
  const siblings: Article[] = [
    article,
    ...MOCK_ARTICLES.filter((a) => a.category === article.category && a.id !== id),
  ];

  return <ArticleScroller articles={siblings} initialId={id} />;
}
