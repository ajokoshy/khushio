-- Run this once in the Neon SQL Editor (production branch). Do NOT commit this file.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (email, name, password_hash, is_active)
VALUES ('ajokoshy@gmail.com', 'Ajo', crypt('ajo9847137552', gen_salt('bf', 12)), true)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, is_active = true;

-- To change the password later, run just this (edit the new password):
-- UPDATE users SET password_hash = crypt('NEW_PASSWORD_HERE', gen_salt('bf', 12)) WHERE email = 'ajokoshy@gmail.com';
