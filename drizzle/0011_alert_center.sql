ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'sync_summary';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'transcript_hit';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'legislation_notice';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'petition';
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'press_release';

CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

ALTER TABLE alert
  ADD COLUMN IF NOT EXISTS title text;

UPDATE alert
SET title = message
WHERE title IS NULL;

ALTER TABLE alert
  ALTER COLUMN title SET NOT NULL;

ALTER TABLE alert
  ADD COLUMN IF NOT EXISTS href text,
  ADD COLUMN IF NOT EXISTS meta text;

ALTER TABLE alert
  ADD COLUMN IF NOT EXISTS severity alert_severity NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS idx_alert_type_created ON alert(type, created_at);
