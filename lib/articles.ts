/**
 * lib/articles.ts
 * Supabase에서 기사를 불러오는 공용 함수.
 * Supabase가 비어있거나 연결 실패 시 mock 데이터로 폴백.
 */

import { supabase } from './supabase';
import { MOCK_ARTICLES } from './mockData';
import { Article, Category } from './types';

const isConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder';

function mapArticle(a: any): Article {
  return {
    ...a,
    keywords: a.tags || a.keywords || [],
  };
}

/** 전체 기사 목록 (최신순, 최대 200개) */
export async function fetchAllArticles(): Promise<Article[]> {
  if (!isConfigured) return MOCK_ARTICLES;

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Supabase] fetchAllArticles error:', error.message);
      return MOCK_ARTICLES;
    }

    return data && data.length > 0 ? data.map(mapArticle) : MOCK_ARTICLES;
  } catch (e) {
    console.error('[Supabase] fetchAllArticles exception:', e);
    return MOCK_ARTICLES;
  }
}

/** 카테고리별 기사 목록 */
export async function fetchArticlesByCategory(category: Exclude<Category, 'all'>): Promise<Article[]> {
  if (!isConfigured) return MOCK_ARTICLES.filter((a) => a.category === category);

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('category', category)
      .order('published_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[Supabase] fetchArticlesByCategory error:', error.message);
      return MOCK_ARTICLES.filter((a) => a.category === category);
    }

    return data && data.length > 0
      ? data.map(mapArticle)
      : MOCK_ARTICLES.filter((a) => a.category === category);
  } catch (e) {
    console.error('[Supabase] fetchArticlesByCategory exception:', e);
    return MOCK_ARTICLES.filter((a) => a.category === category);
  }
}

/** 단일 기사 ID로 조회 */
export async function fetchArticleById(id: string): Promise<Article | null> {
  // mock 데이터 ID 형태이면 바로 반환
  if (id.startsWith('mock-')) {
    return MOCK_ARTICLES.find((a) => a.id === id) ?? null;
  }

  if (!isConfigured) return MOCK_ARTICLES.find((a) => a.id === id) ?? null;

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      // Supabase에 없으면 mock에서 fallback
      return MOCK_ARTICLES.find((a) => a.id === id) ?? null;
    }

    return mapArticle(data);
  } catch (e) {
    console.error('[Supabase] fetchArticleById exception:', e);
    return MOCK_ARTICLES.find((a) => a.id === id) ?? null;
  }
}
