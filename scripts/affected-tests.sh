#!/bin/sh
# Detects test files affected by changes in the current PR.
# Outputs test paths to run, or "ALL" if shared code was changed.
#
# Usage: scripts/affected-tests.sh <base-branch>
# Example: scripts/affected-tests.sh origin/preview

set -e

BASE_BRANCH="${1:-origin/preview}"

# Paths that trigger a full test run when changed
SHARED_PATTERNS="^src/lib/ ^src/db/ ^src/env.ts ^src/index.ts ^src/test/ ^package.json ^bun.lock ^tsconfig.json"

# Get changed files compared to base branch
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD)

if [ -z "$CHANGED_FILES" ]; then
  echo "NO_TESTS"
  exit 0
fi

# Check if any shared path was modified
for pattern in $SHARED_PATTERNS; do
  if echo "$CHANGED_FILES" | grep -qE "$pattern"; then
    echo "ALL"
    exit 0
  fi
done

# Extract unique module paths that have __tests__ directories
TEST_DIRS=""

for file in $CHANGED_FILES; do
  # Match src/modules/<domain>/... or src/modules/<domain>/<subdomain>/...
  # Extract the deepest directory that contains a __tests__ folder
  module_path=$(echo "$file" | grep -oE '^src/modules/[^/]+(/[^/]+)?' || true)

  if [ -z "$module_path" ]; then
    continue
  fi

  # Check for __tests__ at the deepest level first, then parent
  if [ -d "$module_path/__tests__" ]; then
    test_dir="$module_path/__tests__"
  else
    # Try parent (e.g., src/modules/occurrences/absences -> src/modules/occurrences)
    parent_path=$(echo "$module_path" | grep -oE '^src/modules/[^/]+' || true)
    if [ -n "$parent_path" ] && [ -d "$parent_path/__tests__" ]; then
      test_dir="$parent_path/__tests__"
    else
      continue
    fi
  fi

  # Add to list if not already present
  case "$TEST_DIRS" in
    *"$test_dir"*) ;;
    *) TEST_DIRS="$TEST_DIRS $test_dir" ;;
  esac
done

# Trim leading space
TEST_DIRS=$(echo "$TEST_DIRS" | sed 's/^ //')

if [ -z "$TEST_DIRS" ]; then
  echo "NO_TESTS"
else
  echo "$TEST_DIRS"
fi
