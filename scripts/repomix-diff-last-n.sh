#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/repomix-diff-last-n.sh -n <commit_count> [--print-only]

Description:
  Collects unique file paths changed in the last <commit_count> commits,
  then runs:

  npx repomix --include "<comma-separated paths>" -o repomix-diff.xml --style xml --include-logs-count <commit_count>

Options:
  -n, --count <number>  Number of recent commits to inspect (required)
  --print-only          Print the final repomix command without executing it
  -h, --help            Show this help
USAGE
}

commit_count=''
print_only='false'

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--count)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: missing value for -n|--count" >&2
        usage
        exit 1
      fi
      commit_count="$1"
      ;;
    --print-only)
      print_only='true'
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ -z "$commit_count" ]]; then
  echo 'Error: -n|--count is required.' >&2
  usage
  exit 1
fi

if ! [[ "$commit_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: commit count must be a positive integer. Got: $commit_count" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo 'Error: not inside a git repository.' >&2
  exit 1
fi

changed_files=()
while IFS= read -r path; do
  changed_files+=("$path")
done < <(
  git -C "$repo_root" log -n "$commit_count" --name-only --pretty=format: \
    | awk 'NF && !seen[$0]++'
)

if [[ ${#changed_files[@]} -eq 0 ]]; then
  echo "No files found in the last $commit_count commit(s)."
  exit 0
fi

existing_files=()
missing_files=()
for rel_path in "${changed_files[@]}"; do
  if [[ -e "$repo_root/$rel_path" ]]; then
    existing_files+=("$rel_path")
  else
    missing_files+=("$rel_path")
  fi
done

if [[ ${#existing_files[@]} -eq 0 ]]; then
  echo "Found changed files in the last $commit_count commit(s), but none currently exist in the working tree." >&2
  printf 'Missing paths (deleted/renamed out):\n' >&2
  printf '  %s\n' "${missing_files[@]}" >&2
  exit 1
fi

include_arg="$(IFS=,; echo "${existing_files[*]}")"

cmd=(
  npx repomix
  --include "$include_arg"
  -o repomix-diff.xml
  --style xml
  --include-logs-count "$commit_count"
)

echo "Repository root: $repo_root"
echo "Unique changed files collected: ${#changed_files[@]}"
echo "Existing files included: ${#existing_files[@]}"
if [[ ${#missing_files[@]} -gt 0 ]]; then
  echo "Skipped missing files (likely deleted): ${#missing_files[@]}"
fi

echo
echo 'Generated command:'
printf '  %q' "${cmd[@]}"
echo

echo
echo 'Included file list (repo-relative):'
printf '  %s\n' "${existing_files[@]}"

if [[ "$print_only" == 'true' ]]; then
  exit 0
fi

(
  cd "$repo_root"
  "${cmd[@]}"
)
