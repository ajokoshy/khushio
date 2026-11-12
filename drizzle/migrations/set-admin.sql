-- =============================================================================
-- set-admin.sql
-- Create the admin user, or change the admin's password / name / email.
-- Safe to run again. Run it AFTER khushio-sql-firstload.sql.
-- =============================================================================
-- HOW LOGIN WORKS
--   The admin sign-in page checks the email and password against the `users` table in this
--   database (password stored as a bcrypt hash). There are no admin credentials in Vercel
--   variables or in code. Every ACTIVE row in `users` is a full administrator.
--   "Username" on the login page means the email address.
--
-- HOW TO USE (Neon: SQL Editor, choose the correct branch, paste, Run)
--   1. Edit ONLY the lines marked  -- EDIT HERE  below.
--   2. Run. The result grid at the bottom lists the users (never the password or hash).
--   3. Put the placeholders back before you save or commit this file. NEVER commit a real
--      email or password.
--
-- TO CHANGE THE PASSWORD LATER : run this file again with the same email and a new password.
-- TO CHANGE THE EMAIL          : put the CURRENT email in v_replace_email and the new one in v_email.
-- TO DISABLE AN ADMIN          : UPDATE users SET is_active = false WHERE email = 'someone@example.com';
--
-- PASSWORD RULES: 12 to 72 bytes (bcrypt ignores everything after byte 72).
--
-- SAFER FOR PRODUCTION: Neon keeps a history of the queries you run, so a plain password typed
-- here stays in that history. Instead, make the hash on your own machine:
--     npm run auth:hash-password
-- paste the printed hash into v_password_hash, and leave v_password empty. Then only the hash
-- (useless without the password) is ever stored or logged.
-- =============================================================================

DO $$
DECLARE
  v_email         text := 'admin@example.com';      -- EDIT HERE: the login email (stored in lower case)
  v_name          text := 'Site Owner';             -- EDIT HERE: display name
  v_password      text := '';                       -- EDIT HERE: new password (12+ characters) ...
  v_password_hash text := '';                       -- ... OR a bcrypt hash from `npm run auth:hash-password`
  v_replace_email text := '';                       -- EDIT HERE (optional): current email, only when changing the email
  v_hash          text;
BEGIN
  v_email := lower(btrim(v_email));
  v_replace_email := lower(btrim(v_replace_email));

  IF v_email = 'admin@example.com' THEN
    RAISE EXCEPTION 'Edit v_email first: it is still the placeholder.';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'v_email is not a valid email address.';
  END IF;

  IF v_password_hash <> '' THEN
    IF v_password <> '' THEN
      RAISE EXCEPTION 'Fill in v_password OR v_password_hash, not both.';
    END IF;
    IF v_password_hash !~ '^\$2[aby]\$(1[0-9]|0[4-9])\$[./A-Za-z0-9]{53}$' THEN
      RAISE EXCEPTION 'v_password_hash is not a bcrypt hash (it should start with $2b$12$ and be 60 characters).';
    END IF;
    v_hash := v_password_hash;
  ELSE
    IF char_length(v_password) < 12 THEN
      RAISE EXCEPTION 'Password must be at least 12 characters.';
    END IF;
    IF octet_length(v_password) > 72 THEN
      RAISE EXCEPTION 'Password must be at most 72 bytes.';
    END IF;
    v_hash := crypt(v_password, gen_salt('bf', 12));
  END IF;

  IF v_replace_email <> '' AND v_replace_email <> v_email THEN
    -- Changing the email of an existing admin.
    UPDATE users
       SET email = v_email, name = v_name, password_hash = v_hash, is_active = true, updated_at = now()
     WHERE email = v_replace_email;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No user with email % to replace.', v_replace_email;
    END IF;
  ELSE
    -- Create the admin, or reset the password of the existing one.
    INSERT INTO users (email, name, password_hash, is_active)
    VALUES (v_email, v_name, v_hash, true)
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          is_active = true,
          updated_at = now();
  END IF;
END $$;

-- Result: who can sign in now. (The password and its hash are never shown.)
SELECT email, name, is_active, last_login_at, updated_at FROM users ORDER BY created_at;
