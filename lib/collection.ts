import { Article } from './types';

const COLLECTION_KEY = 'brief_collection';

export function getCollection(): Article[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    return raw ? (JSON.parse(raw) as Article[]) : [];
  } catch {
    return [];
  }
}

export function isBookmarked(id: string): boolean {
  return getCollection().some((a) => a.id === id);
}

export function addToCollection(article: Article): void {
  const current = getCollection();
  if (current.some((a) => a.id === article.id)) return;
  localStorage.setItem(COLLECTION_KEY, JSON.stringify([article, ...current]));
}

export function removeFromCollection(id: string): void {
  const current = getCollection().filter((a) => a.id !== id);
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(current));
}

export function toggleCollection(article: Article): boolean {
  if (isBookmarked(article.id)) {
    removeFromCollection(article.id);
    return false;
  } else {
    addToCollection(article);
    return true;
  }
}
