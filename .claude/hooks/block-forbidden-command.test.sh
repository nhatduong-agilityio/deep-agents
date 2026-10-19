#!/usr/bin/env bash
# Table test for block-forbidden-command.sh:  bash .claude/hooks/block-forbidden-command.test.sh
# Exit 1 if any row fails. Rows: <expected exit>|<where>|<command>, where "feat" = a temp repo on a
# feature branch and "main" = a temp repo on main (passed to the hook as the input's cwd).
# Commands may use \n for a newline.
H="$(cd "$(dirname "$0")" && pwd)/block-forbidden-command.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for b in main feat; do
  git init -q -b "$b" "$tmp/$b" && git -C "$tmp/$b" -c user.name=t -c user.email=t@t commit -q --no-verify --allow-empty -m init
done
pass=0; fail=0
while IFS='|' read -r want where cmd; do
  [ -z "$cmd" ] && continue
  cmd="$(printf '%b' "$cmd")"
  json=$(python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "$cmd" "$tmp/$where")
  printf '%s' "$json" | CLAUDE_PROJECT_DIR="$tmp/feat" "$H" 2>/dev/null >/dev/null; got=$?
  if [ "$got" = "$want" ]; then pass=$((pass+1)); r=ok; else fail=$((fail+1)); r=FAIL; fi
  printf '%-4s want=%s got=%s [%s] %s\n' "$r" "$want" "$got" "$where" "$(printf '%s' "$cmd" | tr '\n' '⏎')"
done <<'T'
2|feat|git push origin main
2|feat|git push github deep-agents
2|feat|git push -u origin HEAD:main
2|feat|git push origin +main
2|feat|git push origin feature:refs/heads/deep-agents
2|feat|git push origin --delete main
2|feat|git -C /tmp/x push origin main
2|feat|git --git-dir .git push origin main
2|feat|git push --all origin
2|feat|git push --mirror origin
2|feat|git commit --no-verify -m "x"
2|feat|git commit --no-verif -m "x"
2|feat|git commit -nm "x"
2|feat|git push --no-verify origin chore/x
2|feat|HUSKY=0 git commit -m x
2|feat|git -c core.hooksPath=/dev/null commit -m x
2|feat|git reset --hard
2|feat|git reset --hard HEAD~1
2|feat|cat .env
2|feat|less apps/web/.env.local
2|feat|source .env && pnpm dev
2|feat|grep KEY .env.production
2|feat|FOO=1 cat ./.env
2|feat|cat < .env
2|feat|cp .env /tmp/leak
2|feat|cp -t /tmp .env
2|feat|bash -c "cat .env"
2|feat|git status && git push origin main
2|feat|git status\ngit push origin main
2|feat|git add .\ngit commit --no-verify -m x
2|feat|echo hi\ncat .env
2|feat|echo a#b && git push origin main
2|feat|curl http://x/#frag; git reset --hard
2|feat|time git push origin main
2|feat|nohup git push origin main
2|feat|{ git push origin main; }
2|feat|if true; then git push origin main; fi
2|main|git push
2|main|git push origin
2|main|git push origin HEAD
2|main|git push -u origin @
0|feat|git status
0|feat|git push
0|feat|git push origin HEAD
0|feat|git push origin chore/x
0|feat|git push -u github chore/claude-block-forbidden-command
0|feat|git push -o merge_request.create origin chore/x
0|feat|git commit -m "feat: add -n flag docs"
0|feat|git commit -mnew
0|feat|git commit -uno -m x
0|feat|git commit -m -n
0|feat|git commit --amend --no-edit
0|feat|git commit -m "$(cat <<'EOF'\nfix: body\ngit push origin main -n\nEOF\n)"
0|feat|git reset --soft HEAD~1
0|feat|git reset HEAD file.ts
0|feat|cat .env.example
0|feat|grep -n AUTH_TOKEN .env.example
0|feat|cp .env.example .env
0|feat|cp .env.example .env 2>/dev/null
0|feat|echo "git push origin main"
0|feat|git log --grep="--no-verify"
0|feat|echo maintenance
0|feat|pnpm test
0|feat|git log --oneline main..HEAD
T
echo "pass=$pass fail=$fail"
[ "$fail" = 0 ]
