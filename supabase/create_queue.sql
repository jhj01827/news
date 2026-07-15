-- Supabase SQL: news_queue 테이블 생성 스크립트
-- Supabase Dashboard > SQL Editor 에서 실행하세요.

create table if not exists news_queue (
  id            uuid primary key default gen_random_uuid(),
  url           text unique not null,
  category      text not null check (category in ('tech','beauty','fashion','culture','social')),
  title         text not null,
  source_name   text not null,
  pub_date      text,
  description   text,
  image_url     text,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  retry_count   int not null default 0,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 인덱스 추가로 대기 쿼리 성능 최적화
create index if not exists news_queue_status_created_idx on news_queue(status, created_at);
