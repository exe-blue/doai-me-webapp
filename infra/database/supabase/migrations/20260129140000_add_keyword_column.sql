-- Add keyword column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS keyword TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_keyword ON jobs(keyword);
UPDATE jobs SET keyword = title WHERE keyword IS NULL;
