#!/bin/sh
# Runs once, when the local volume is empty: creates the dev and test databases
# and applies the role bootstrap to each (ADR-0014). Local-only credentials.
set -eu

for db in read_in_blocks read_in_blocks_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
    -v app_password="$APP_DB_PASSWORD" \
    -v migrator_password="$MIGRATOR_DB_PASSWORD" \
    -f /bootstrap/roles.sql
done
