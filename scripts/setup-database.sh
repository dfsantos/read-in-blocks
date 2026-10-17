#!/usr/bin/env bash
# Sets up the database roles in Neon and the database variables in Vercel (ADR-0014,
# docs/architecture/database.md). Safe to re-run: it also rotates all four passwords.
#
# Secrets never leave this machine except to Neon and Vercel: owner URLs are read with
# hidden prompts, role passwords are generated locally, and none of them is printed or
# passed as a command-line argument (psql gets them through PG* variables and stdin).
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'printf "  \033[31m✗\033[0m stopped unexpectedly at line %s (nothing after this point ran)\n" "$LINENO" >&2' ERR

VERCEL=(pnpm dlx vercel@64.3.1)

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m✗\033[0m %s\n' "$1" >&2
  exit 1
}

for cmd in psql openssl python3 pnpm; do
  command -v "$cmd" >/dev/null || fail "$cmd not found"
done

# Splits a postgres URL read from stdin into: direct host, port, database, user, password.
# A pooled host (-pooler) is converted to the direct one.
parse_url() {
  python3 -I -c '
import sys, urllib.parse as u
p = u.urlsplit(sys.stdin.read().strip())
if p.scheme not in ("postgres", "postgresql") or not p.hostname or not p.username or not p.password:
    sys.exit(1)
first, _, rest = p.hostname.partition(".")
print(first.removesuffix("-pooler") + "." + rest)
print(p.port or 5432)
print(p.path.lstrip("/") or "neondb")
print(u.unquote(p.username))
print(u.unquote(p.password))
'
}

# Neon pooled host: first DNS label + "-pooler".
pooled_host() {
  local first="${1%%.*}" rest="${1#*.}"
  printf '%s-pooler.%s' "$first" "$rest"
}

# psql with TLS verification; connection details come from the PG* variables set by the caller.
psql_tls() {
  PGSSLMODE=verify-full PGSSLROOTCERT=system psql -X -q -v ON_ERROR_STOP=1 "$@"
}

read_owner_url() {
  local label="$1" url
  read -r -s -p "  Owner connection string for the Neon '$label' branch (input hidden): " url ||
    fail "no input received for '$label' (paste the string, then press Enter)"
  printf '\n' >&2
  [[ -n "$url" ]] || fail "empty connection string for '$label'"
  printf '%s' "$url"
}

# 192 random bits as hex: above Neon's 60-bit entropy minimum and safe inside a URL without encoding.
new_password() { openssl rand -hex 24; }

# Creates the roles (if missing), applies the grants and sets fresh passwords on one branch.
# Writes the resulting app and migrator URLs to the globals APP_URL and MIGRATOR_URL.
configure_branch() {
  local label="$1" owner_url="$2" app_pw="$3" migrator_pw="$4" fields
  fields="$(parse_url <<<"$owner_url")" || fail "'$label': not a valid postgres connection string with user and password"
  local host port db owner_user owner_pw
  {
    read -r host
    read -r port
    read -r db
    read -r owner_user
    read -r owner_pw
  } <<<"$fields"

  # Neon only accepts plaintext passwords ("Hashed passwords are not supported", docs/manage/roles;
  # a SCRAM verifier is rejected by its control plane) and stores them hashed. The passwords reach
  # psql only through stdin `\set`, never process arguments or shell history, over TLS verify-full.
  {
    printf "\\\\set app_password '%s'\n\\\\set migrator_password '%s'\n" "$app_pw" "$migrator_pw"
    cat src/db/bootstrap/roles.sql
    printf "ALTER ROLE app PASSWORD :'app_password';\n"
    printf "ALTER ROLE migrator PASSWORD :'migrator_password';\n"
  } | PGHOST="$host" PGPORT="$port" PGDATABASE="$db" PGUSER="$owner_user" PGPASSWORD="$owner_pw" \
    psql_tls -f - >/dev/null || fail "'$label': role setup failed (see the psql error above)"
  ok "'$label': roles app and migrator ready, passwords set"

  local pooled current
  pooled="$(pooled_host "$host")"
  current="$(PGHOST="$pooled" PGPORT="$port" PGDATABASE="$db" PGUSER=app PGPASSWORD="$app_pw" \
    psql_tls -tA -c 'SELECT current_user')" || fail "'$label': app cannot connect through the pooler"
  [[ "$current" == "app" ]] || fail "'$label': unexpected user for app"
  ok "'$label': app connects through the pooler ($pooled)"

  current="$(PGHOST="$host" PGPORT="$port" PGDATABASE="$db" PGUSER=migrator PGPASSWORD="$migrator_pw" \
    psql_tls -tA -c 'SELECT current_user')" || fail "'$label': migrator cannot connect directly"
  [[ "$current" == "migrator" ]] || fail "'$label': unexpected user for migrator"
  ok "'$label': migrator connects directly ($host)"

  APP_URL="postgresql://app:${app_pw}@${pooled}:${port}/${db}?sslmode=verify-full"
  MIGRATOR_URL="postgresql://migrator:${migrator_pw}@${host}:${port}/${db}?sslmode=verify-full"
}

# Non-interactive Vercel call: no prompts can block it or consume stdin, and it gives up
# after two minutes. --yes takes the defaults (a Preview variable applies to all branches).
vercel_batch() { timeout 120 "${VERCEL[@]}" "$@" --non-interactive; }

vercel_has_env() {
  local name="$1" target="$2"
  vercel_batch env ls "$target" </dev/null 2>/dev/null | grep -qE "^[[:space:]]*${name}[[:space:]]"
}

set_vercel_env() {
  local name="$1" target="$2" value="$3"
  printf '%s' "$value" | vercel_batch env add "$name" "$target" --sensitive --force --yes >/dev/null ||
    fail "vercel: could not set $name ($target)"
  # The CLI can exit 0 without saving (e.g. an unanswered prompt), so read it back.
  vercel_has_env "$name" "$target" || fail "vercel: $name ($target) was not saved"
  ok "vercel: $name set for $target"
}

step "1/4 Vercel login and project link"
"${VERCEL[@]}" whoami >/dev/null 2>&1 || "${VERCEL[@]}" login
# The CLI links either a single project (project.json) or by Git repository (repo.json).
is_linked() { [[ -f .vercel/project.json || -f .vercel/repo.json ]]; }
is_linked || "${VERCEL[@]}" link
is_linked || fail "project not linked"
ok "linked to the Vercel project"

step "2/4 Neon owner connection strings (Neon console → Connect → role neondb_owner)"
PROD_OWNER_URL="$(read_owner_url main)"
PREVIEW_OWNER_URL="$(read_owner_url preview)"

step "3/4 Roles and passwords in Neon"
configure_branch main "$PROD_OWNER_URL" "$(new_password)" "$(new_password)"
PROD_APP_URL="$APP_URL" PROD_MIGRATOR_URL="$MIGRATOR_URL"
configure_branch preview "$PREVIEW_OWNER_URL" "$(new_password)" "$(new_password)"
PREVIEW_APP_URL="$APP_URL" PREVIEW_MIGRATOR_URL="$MIGRATOR_URL"
unset PROD_OWNER_URL PREVIEW_OWNER_URL APP_URL MIGRATOR_URL

step "4/4 Variables in Vercel"
# The Neon integration creates DATABASE_URL with the owner credential (DDL);
# remove it so our app-role value is the only one (approved by the owner on 2026-10-15).
# The other integration variables carry the same owner credential and are not used by the
# app; remove them too (approved by the owner on 2026-10-16).
INTEGRATION_VARS=(DATABASE_URL DATABASE_URL_UNPOOLED PGHOST PGHOST_UNPOOLED PGUSER PGDATABASE PGPASSWORD
  POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_URL_NO_SSL POSTGRES_PRISMA_URL POSTGRES_HOST POSTGRES_USER
  POSTGRES_PASSWORD POSTGRES_DATABASE NEON_PROJECT_ID NEON_AUTH_BASE_URL VITE_NEON_AUTH_URL)
for target in production preview; do
  for name in "${INTEGRATION_VARS[@]}"; do
    if vercel_has_env "$name" "$target"; then
      vercel_batch env rm "$name" "$target" --yes </dev/null >/dev/null ||
        fail "vercel: could not remove $name ($target)"
      ok "vercel: removed integration variable $name ($target)"
    fi
  done
done
set_vercel_env DATABASE_URL production "$PROD_APP_URL"
set_vercel_env MIGRATOR_DATABASE_URL production "$PROD_MIGRATOR_URL"
set_vercel_env DATABASE_URL preview "$PREVIEW_APP_URL"
set_vercel_env MIGRATOR_DATABASE_URL preview "$PREVIEW_MIGRATOR_URL"
unset PROD_APP_URL PROD_MIGRATOR_URL PREVIEW_APP_URL PREVIEW_MIGRATOR_URL

step "Done"
printf '  Redeploy the Preview (existing deployments keep their old variables) and open /api/health.\n'
