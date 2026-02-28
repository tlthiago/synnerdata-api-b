#!/usr/bin/env bash
set -euo pipefail

# Compares orgStatements and orgRoles between frontend and backend permissions files.
# Exits with code 1 if the shared sections have diverged.
#
# Usage: ./scripts/check-permissions-sync.sh <frontend-file> <backend-file>

FRONTEND_FILE="${1:?Usage: $0 <frontend-file> <backend-file>}"
BACKEND_FILE="${2:?Usage: $0 <frontend-file> <backend-file>}"

if [[ ! -f "$FRONTEND_FILE" ]]; then
  echo "ERROR: Frontend file not found: $FRONTEND_FILE"
  exit 1
fi

if [[ ! -f "$BACKEND_FILE" ]]; then
  echo "ERROR: Backend file not found: $BACKEND_FILE"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Extract orgStatements block: from "export const orgStatements" to "} as const;"
extract_statements() {
  sed -n '/^export const orgStatements/,/} as const;/p' "$1"
}

# Extract orgRoles block: from "export const orgRoles" to the final "};"
# Normalize the declaration to strip type annotations.
extract_roles() {
  sed -n '/^export const orgRoles/,/^};$/p' "$1" \
    | sed -E '1s/^export const orgRoles[^=]*=/export const orgRoles =/'
}

# Extract sections from both files
extract_statements "$FRONTEND_FILE" > "$TMPDIR/fe-statements.txt"
extract_statements "$BACKEND_FILE" > "$TMPDIR/be-statements.txt"
extract_roles "$FRONTEND_FILE" > "$TMPDIR/fe-roles.txt"
extract_roles "$BACKEND_FILE" > "$TMPDIR/be-roles.txt"

# Verify extraction produced output before comparing
for label_file in "orgStatements from frontend:$TMPDIR/fe-statements.txt" \
                  "orgStatements from backend:$TMPDIR/be-statements.txt" \
                  "orgRoles from frontend:$TMPDIR/fe-roles.txt" \
                  "orgRoles from backend:$TMPDIR/be-roles.txt"; do
  label="${label_file%%:*}"
  file="${label_file##*:}"
  if [[ ! -s "$file" ]]; then
    echo "ERROR: Could not extract $label file."
    exit 1
  fi
done

HAS_DIFF=false

# Compare orgStatements
DIFF_STATEMENTS=$(diff "$TMPDIR/fe-statements.txt" "$TMPDIR/be-statements.txt" || true)
if [[ -n "$DIFF_STATEMENTS" ]]; then
  echo "DIVERGENCE in orgStatements:"
  echo "$DIFF_STATEMENTS"
  echo ""
  HAS_DIFF=true
fi

# Compare orgRoles
DIFF_ROLES=$(diff "$TMPDIR/fe-roles.txt" "$TMPDIR/be-roles.txt" || true)
if [[ -n "$DIFF_ROLES" ]]; then
  echo "DIVERGENCE in orgRoles:"
  echo "$DIFF_ROLES"
  echo ""
  HAS_DIFF=true
fi

if [[ "$HAS_DIFF" == true ]]; then
  echo "FAILED: permissions.ts is out of sync between frontend and backend."
  echo "Please update both files to match."
  exit 1
fi

echo "OK: orgStatements and orgRoles are in sync."
exit 0
