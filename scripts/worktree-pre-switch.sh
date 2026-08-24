#!/usr/bin/env bash
set -euo pipefail

target_worktree_path="${1:?missing target worktree path}"
target_branch="${2:?missing target branch}"
source_branch="${3:?missing source branch}"
source_worktree_path="$(pwd -P)"

printf 'Switching from %s to %s\n' "$source_branch" "$target_branch"
printf 'Source: %s\nTarget: %s\n' "$source_worktree_path" "$target_worktree_path"

# Add commands that must run before every switch below.
# This hook runs from the source worktree. When Worktrunk creates a worktree,
# target_worktree_path does not exist yet.
#
# Example, validate the source worktree:
# bun --cwd "$source_worktree_path/frontend" run lint
#
# Example, operate on an existing destination worktree:
# if [[ -d "$target_worktree_path" ]]; then
# 	bun --cwd "$target_worktree_path/frontend" install --frozen-lockfile
# fi

:
