-- 007: admin audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at      timestamp DEFAULT now(),
  actor   text NOT NULL,
  action  text NOT NULL,
  target  text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);
