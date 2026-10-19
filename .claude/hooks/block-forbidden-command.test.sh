#!/usr/bin/env bash
# Table test for block-forbidden-command.sh. Run from the repo root on a feature branch:
#   bash .claude/hooks/block-forbidden-command.test.sh   (exit 1 if any row fails)
H=.claude/hooks/block-forbidden-command.sh; pass=0; fail=0
while IFS='|' read -r want cmd; do
  [ -z "$cmd" ] && continue
  json=$(python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$cmd")
  printf '%s' "$json" | $H 2>/dev/null >/dev/null; got=$?
  if [ "$got" = "$want" ]; then pass=$((pass+1)); r=ok; else fail=$((fail+1)); r=FAIL; fi
  printf '%-4s want=%s got=%s  %s\n' "$r" "$want" "$got" "$cmd"
done <<'T'
2|git push origin main
2|git push github deep-agents
2|git push -u origin HEAD:main
2|git push origin +main
2|git push origin feature:refs/heads/deep-agents
2|git push origin --delete main
2|git -C /tmp/x push origin main
2|git commit --no-verify -m "x"
2|git commit -nm "x"
2|git push --no-verify origin chore/x
2|git reset --hard
2|git reset --hard HEAD~1
2|cat .env
2|less apps/web/.env.local
2|source .env && pnpm dev
2|grep KEY .env.production
2|FOO=1 cat ./.env
2|git status && git push origin main
0|git status
0|git push origin chore/x
0|git push -u github chore/claude-block-forbidden-command
0|git push -o merge_request.create origin chore/x
0|git commit -m "feat: add -n flag docs"
0|git commit --amend --no-edit
0|git reset --soft HEAD~1
0|git reset HEAD file.ts
0|cat .env.example
0|grep -n AUTH_TOKEN .env.example
0|echo maintenance
0|pnpm test
0|git log --oneline main..HEAD
2|cp .env /tmp/leak
0|cp .env.example .env
T
echo "pass=$pass fail=$fail"
[ "$fail" = 0 ]
