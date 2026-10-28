-- Sample data (optional). Links point to example.com; replace in /admin before launch.
INSERT INTO products (slug, name, brand, category, blurb, price, mrp) VALUES
  ('jute-storage-basket-set',  'Jute storage basket set',  'greenleaf', 'home-living',          'Three nesting baskets for shelves and wardrobes.',        899, 1299),
  ('wireless-earbuds-air',     'Wireless earbuds Air',     'tarang',    'electronics-gadgets',  'Lightweight earbuds with a pocket charging case.',       1799, 2999),
  ('vitamin-c-face-serum',     'Vitamin C face serum',     'kora',      'beauty-personal-care', 'A daily serum for an even-looking glow.',                 549, NULL),
  ('cotton-block-print-scarf', 'Cotton block-print scarf', 'greenleaf', 'fashion-accessories',  'A soft, breathable scarf in a terracotta print.',         699, NULL),
  ('resistance-band-kit',      'Resistance band kit',      'tarang',    'sports-fitness',       'Five bands with a carry pouch for home workouts.',        499, 799),
  ('wooden-stacking-toy',      'Wooden stacking toy',      'greenleaf', 'kids-baby',            'A painted wooden stacker for toddlers.',                  649, NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO offers (product_id, merchant, url)
SELECT p.id, v.merchant, v.url
FROM (VALUES
  ('jute-storage-basket-set',  'Sample Store',  'https://example.com/p/1'),
  ('wireless-earbuds-air',     'Sample Store',  'https://example.com/p/2'),
  ('vitamin-c-face-serum',     'Sample Beauty', 'https://example.com/p/3'),
  ('cotton-block-print-scarf', 'Sample Store',  'https://example.com/p/4'),
  ('resistance-band-kit',      'Sample Sports', 'https://example.com/p/5'),
  ('wooden-stacking-toy',      'Sample Kids',   'https://example.com/p/6')
) AS v(slug, merchant, url)
JOIN products p ON p.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM offers o WHERE o.product_id = p.id);

INSERT INTO deals (title, merchant, url, ends)
SELECT * FROM (VALUES
  ('Wireless earbuds Air at 40% off', 'Sample Store', 'https://example.com/p/2', '2026-11-15'),
  ('Home storage sale on baskets',    'Sample Store', 'https://example.com/p/1', '2026-11-30')
) AS v(title, merchant, url, ends)
WHERE NOT EXISTS (SELECT 1 FROM deals);

INSERT INTO coupons (code, merchant, detail, url)
SELECT * FROM (VALUES
  ('SAMPLE10', 'Sample Beauty', '10% off your first order (sample)',   'https://example.com/p/3'),
  ('KIDS150',  'Sample Kids',   'Rs 150 off above Rs 999 (sample)',    'https://example.com/p/6')
) AS v(code, merchant, detail, url)
WHERE NOT EXISTS (SELECT 1 FROM coupons);

INSERT INTO articles (slug, title, excerpt, body, date) VALUES
  ('how-we-pick-products', 'How we pick products',
   'What we look at before a product appears on Khushio.',
   E'We start with what people actually need: durable, fairly priced everyday items.\n\nWe compare price history, reviews and return policies before listing anything.\n\nSome links on Khushio are affiliate links. They never change which products we choose.',
   '2026-10-28'),
  ('small-upgrades-for-a-happier-home', 'Small upgrades for a happier home',
   'Five low-cost changes that make a room feel calmer.',
   E'Start with storage: baskets and shelves clear visual clutter fast.\n\nAdd one natural texture such as jute, cotton or wood.\n\nSwap harsh bulbs for warm light in the evening.',
   '2026-10-28')
ON CONFLICT (slug) DO NOTHING;
