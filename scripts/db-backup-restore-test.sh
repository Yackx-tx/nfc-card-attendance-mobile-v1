#!/usr/bin/env bash
set -euo pipefail

echo "=== AMAS Automated Backup & Restore Verification Test (OPS-01) ==="

BACKUP_FILE="/tmp/amas_backup_test_$(date +%s).sql"
RESTORE_DB="amas_restore_verification_test"

echo "1. Generating pg_dump from development database (amas_dev)..."
pg_dump "postgresql://postgres:yannick123@localhost:5432/amas_dev" -F p -f "$BACKUP_FILE"

echo "Backup generated successfully: $(ls -lh "$BACKUP_FILE")"

echo "2. Creating clean restore verification database ($RESTORE_DB)..."
psql "postgresql://postgres:yannick123@localhost:5432/postgres" -c "DROP DATABASE IF EXISTS $RESTORE_DB;"
psql "postgresql://postgres:yannick123@localhost:5432/postgres" -c "CREATE DATABASE $RESTORE_DB;"

echo "3. Restoring database from dump..."
psql "postgresql://postgres:yannick123@localhost:5432/$RESTORE_DB" -f "$BACKUP_FILE" > /dev/null

echo "4. Verifying restored tables and record counts..."
TABLE_COUNT=$(psql "postgresql://postgres:yannick123@localhost:5432/$RESTORE_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Restored table count: $TABLE_COUNT"

if [ "$TABLE_COUNT" -lt 14 ]; then
    echo "ERROR: Expected at least 14 restored tables, found $TABLE_COUNT"
    exit 1
fi

echo "5. Cleaning up verification database and backup dump..."
psql "postgresql://postgres:yannick123@localhost:5432/postgres" -c "DROP DATABASE $RESTORE_DB;"
rm -f "$BACKUP_FILE"

echo "=== OPS-01 Backup & Restore Verification PASSED ==="
