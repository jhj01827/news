-- Supabase SQL Editor에서 실행하여 tags 컬럼을 추가하세요.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags text[];
