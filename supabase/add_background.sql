-- Add background column to articles table
-- Run this in Supabase Dashboard > SQL Editor

alter table articles
  add column if not exists background text;
