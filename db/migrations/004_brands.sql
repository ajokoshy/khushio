-- 004: brands managed from the admin
CREATE TABLE IF NOT EXISTS brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  about       text NOT NULL DEFAULT '',
  created_at  timestamp DEFAULT now()
);
INSERT INTO brands (slug, name, about) VALUES
  ('greenleaf', 'Greenleaf', 'Sample emerging brand for everyday home goods.'),
  ('tarang',    'Tarang',    'Sample brand for sound and small electronics.'),
  ('kora',      'Kora',      'Sample brand for skin and body care.')
ON CONFLICT (slug) DO NOTHING;
