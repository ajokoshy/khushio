#!/usr/bin/env bash
# Release 7B: a logical backup of the Neon database (a plain SQL file you can read, move and restore anywhere).
# Run it once a month (docs/BACKUP.md) from your own computer, or let .github/workflows/backup.yml run it.
#
#   DATABASE_URL_UNPOOLED="postgresql://..."  ./scripts/backup-dump.sh [output-folder]
#
# Use the UNPOOLED (direct) connection string from Neon, not the pooled one: pg_dump needs a direct connection.
# Needs pg_dump version 16 or newer (Neon runs Postgres 16/17): macOS "brew install libpq", Ubuntu "apt install postgresql-client".
set -euo pipefail

: "${DATABASE_URL_UNPOOLED:?Set DATABASE_URL_UNPOOLED to the direct Neon connection string}"
out_dir="${1:-.}"
stamp="$(date -u +%Y-%m-%d)"
file="${out_dir}/khushio-${stamp}.sql.gz"
mkdir -p "${out_dir}"

# --no-owner/--no-privileges: the file restores into any database. The schema AND the data are included.
pg_dump --no-owner --no-privileges --format=plain "${DATABASE_URL_UNPOOLED}" | gzip -9 > "${file}"

# A dump with no tables in it is a failed backup; check before saying it worked.
if ! gzip -dc "${file}" | grep -q "CREATE TABLE public.products"; then
  echo "Backup FAILED: ${file} does not contain the products table" >&2
  exit 1
fi
bytes="$(wc -c < "${file}" | tr -d ' ')"
echo "Backup written: ${file} (${bytes} bytes)"
echo "Now copy it OFF this computer and off Neon/Vercel (docs/BACKUP.md), and keep the last 6."
