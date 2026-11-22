# Backup and restore (Release 7B)

Three layers, from fastest to slowest to use. Do not rely on only one.

| Layer | What it protects against | How long it keeps | Who does it |
| --- | --- | --- | --- |
| 1. Neon point-in-time restore | A bad edit, a wrong SQL script, an accidental delete | The restore window of your Neon plan (check Neon > Settings > Storage: it is a number of days, short on the free plan) | Neon, automatically |
| 2. Neon branch before every production SQL script | A release script that went wrong | A week (see `docs/DEPLOYMENT.md`) | You, once per release |
| 3. Monthly logical dump saved off-platform | Losing the Neon project or account, or needing data older than the restore window | You decide: keep the last 6 | You, monthly (or the GitHub workflow plus a copy) |

Pictures are not in the database. They live in Cloudinary (the originals stay there); the database only holds their public ids. Cloudinary offers an optional automatic backup of uploads in its settings (look for "backup" under Upload settings; the name and price change, so check it); decide if you want it on.

## 1. Know your restore window
Neon console > your project > Settings > Storage (history retention). Write the number of days here: ______. Restoring is a Neon feature (Branches > Restore), it makes a copy as of a chosen time; test it once on the preview branch before you ever need it.

## 2. Branch before production scripts
Already part of the release procedure. Name it `backup-<release>-<date>`; delete after a week.

## 3. Monthly logical dump
A plain SQL file with every table and row (schema and data). You can read it, store it anywhere and restore it into any Postgres.

**By hand (once a month, 5 minutes):**
1. Install the PostgreSQL client tools, version 16 or newer (macOS: `brew install libpq` then add it to your path; Windows: the "Command Line Tools" option of the PostgreSQL installer; Ubuntu: `sudo apt install postgresql-client`).
2. In Neon, open the production branch, Connect, turn **off** Connection pooling, copy the connection string (this is `DATABASE_URL_UNPOOLED`).
3. Run: `DATABASE_URL_UNPOOLED="postgresql://..." ./scripts/backup-dump.sh backups` — it writes `backups/khushio-YYYY-MM-DD.sql.gz` and checks the file really contains the products table.
4. Copy the file **off this computer and off Neon, Vercel and GitHub**: an encrypted cloud drive or an external disk. Keep the last 6. Never commit it to Git: it contains customer-free but business-sensitive data and password hashes of admins.

**Automatic (optional):** the workflow `.github/workflows/backup.yml` does steps 1 to 3 on the 1st of each month, encrypts the file with AES-256 and keeps it as a workflow artifact for 90 days. Add two repository secrets: `BACKUP_DATABASE_URL` (the unpooled string; a read-only Neon role is best) and `BACKUP_PASSPHRASE` (store it in your password manager: without it the file cannot be opened). You still download the artifact once a month and keep a copy off-platform (step 4); the artifact alone does not count as off-platform.

## Restore drill (do it once before launch, then every six months)
1. In Neon create a new empty branch or project named `restore-test`. Copy its direct connection string.
2. `gunzip -c backups/khushio-2026-12-01.sql.gz | psql "<restore-test string>"` (for an encrypted artifact first: `gpg --decrypt file.sql.gz.gpg > file.sql.gz`).
3. Point a **local** copy of the site at it (`DATABASE_URL=...` in `.env.local`, `npm run dev`), sign in and open Products, Articles and Redirects.
4. Write the date and result in the log below, then delete the test branch.

To recover for real, restore into a NEW Neon branch, check it, then switch the Vercel `DATABASE_URL` to it and redeploy (or use Neon's restore to swap the data back in place).

## Log
| Date | What | Result | By |
| --- | --- | --- | --- |
| | First logical dump | | |
| | Restore drill | | |
