-- 005: categories managed from the admin
CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  icon        text NOT NULL DEFAULT 'Sparkles',
  tone        text NOT NULL DEFAULT 'sand',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamp DEFAULT now()
);
INSERT INTO categories (slug, label, icon, tone, position) VALUES
  ('fashion-accessories',  'Fashion & Accessories',  'Shirt',      'rose',   1),
  ('electronics-gadgets',  'Electronics & Gadgets',  'Smartphone', 'teal',   2),
  ('beauty-personal-care', 'Beauty & Personal Care', 'Sparkles',   'rose',   3),
  ('home-living',          'Home & Living',          'Home',       'sage',   4),
  ('kids-baby',            'Kids & Baby',            'Baby',       'gold',   5),
  ('sports-fitness',       'Sports & Fitness',       'Dumbbell',   'violet', 6),
  ('travel-experiences',   'Travel & Experiences',   'Plane',      'mint',   7),
  ('books-more',           'Books & More',           'BookOpen',   'sand',   8)
ON CONFLICT (slug) DO NOTHING;
