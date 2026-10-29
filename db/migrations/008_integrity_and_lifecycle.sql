-- 008: offer/deal/coupon lifecycle, merchant approved domains, timestamps, SEO fields, click context, import staging
ALTER TABLE products  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
ALTER TABLE products  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS seo_description text;

ALTER TABLE offers    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS last_verified_at timestamp;
ALTER TABLE offers    ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
CREATE INDEX IF NOT EXISTS offers_product_idx  ON offers (product_id);
CREATE INDEX IF NOT EXISTS offers_merchant_idx ON offers (merchant_id);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS approved_domains text NOT NULL DEFAULT '';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE deals     ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
UPDATE deals SET expires_at = (ends::date + interval '23 hours 59 minutes 59 seconds' - interval '5 hours 30 minutes')
  WHERE expires_at IS NULL AND ends ~ '^\d{4}-\d{2}-\d{2}$';

ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS verified_at timestamp;
ALTER TABLE coupons   ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE articles  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

ALTER TABLE clicks    ADD COLUMN IF NOT EXISTS merchant_id uuid;
CREATE INDEX IF NOT EXISTS clicks_at_idx ON clicks (at);

CREATE TABLE IF NOT EXISTS import_staging (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'products',
  csv         text NOT NULL,
  created_at  timestamp DEFAULT now()
);
