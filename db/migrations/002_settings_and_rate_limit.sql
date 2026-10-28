-- 002: site settings, login rate limiting, click index
CREATE TABLE IF NOT EXISTS site_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  updated_at  timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip  text NOT NULL,
  at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_at_idx ON login_attempts (ip, at);
CREATE INDEX IF NOT EXISTS clicks_offer_at_idx ON clicks (offer_id, at);
