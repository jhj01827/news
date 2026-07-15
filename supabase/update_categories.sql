-- Migration: replace 'meme' and 'retail' with 'social'
-- Run this in Supabase Dashboard > SQL Editor

-- 1. 기존 meme / retail 기사를 social / culture로 마이그레이션
UPDATE articles SET category = 'social'  WHERE category = 'meme';
UPDATE articles SET category = 'culture' WHERE category = 'retail';

-- 2. 기존 category check constraint 제거 후 새 제약 조건 추가
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_category_check;
ALTER TABLE articles ADD CONSTRAINT articles_category_check
  CHECK (category IN ('tech','beauty','fashion','culture','social'));
