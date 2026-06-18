import { notFound } from 'next/navigation';
import { fetchArticleById, fetchAllArticles } from '@/lib/articles';
import { Article } from '@/lib/types';
import ArticleScroller from '@/components/ArticleScroller';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await fetchArticleById(id);
  return {
    title: article ? `${article.hook_title} — BRIEF` : 'BRIEF',
    description: article?.summary?.slice(0, 120),
  };
}

export default async function FeedDetailPage({ params }: Props) {
  const { id } = await params;

  const article = await fetchArticleById(id);
  if (!article) notFound();

  // 수시브린 전환을 위한 같은 카테고리 기사 (현재 기사 맴 앞으로)
  const allArticles = await fetchAllArticles();
  const siblings: Article[] = [
    article,
    ...allArticles.filter((a) => a.category === article.category && a.id !== id),
  ];

  return <ArticleScroller articles={siblings} initialId={id} />;
}
