-- 003: product image (Cloudinary URL)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
