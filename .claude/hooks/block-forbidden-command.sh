#!/usr/bin/env bash
# PreToolUse (Bash): block commands the team never runs through Claude. Exit 2 blocks the call and
# shows the reason (stderr) to Claude; exit 0 allows it. Covers what permission rules can't express:
#   - git commit/push with --no-verify (or commit -n): skips husky + commitlint
#   - git push to main or deep-agents (explicit refspec, or a bare push while on one of them)
#   - git reset --hard: discards uncommitted work
#   - reading .env files through the shell (cat/less/source/grep…); .env.example is allowed
# If python3 is missing or the input can't be parsed, it allows (never blocks blindly).
input="$(cat)"
command -v python3 >/dev/null 2>&1 || exit 0
cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || true

HOOK_INPUT="$input" exec python3 - <<'PY'
import json, os, re, shlex, subprocess, sys

PROTECTED = {"main", "deep-agents"}
READERS = {"cat", "less", "more", "head", "tail", "bat", "source", ".", "grep", "rg", "awk", "sed", "xxd", "strings", "cp", "base64"}

try:
    cmd = json.loads(os.environ["HOOK_INPUT"]).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)
if not cmd:
    sys.exit(0)

def block(reason):
    print(f"Blocked by .claude/hooks/block-forbidden-command.sh: {reason}", file=sys.stderr)
    sys.exit(2)

try:
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=";&|()")
    lex.whitespace_split = True
    tokens = list(lex)
except ValueError:
    tokens = cmd.split()

# Split into simple commands on ; && || | ( )
segments, cur = [], []
for t in tokens:
    if t and set(t) <= set(";&|()"):
        if cur:
            segments.append(cur)
        cur = []
    else:
        cur.append(t)
if cur:
    segments.append(cur)

def current_branch():
    try:
        return subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""

def is_env_file(arg):
    name = os.path.basename(arg)
    return re.fullmatch(r"\.env(\..+)?", name) is not None and name != ".env.example"

for seg in segments:
    # Drop leading VAR=value assignments and sudo/env/command wrappers
    while seg and (re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", seg[0]) or seg[0] in {"sudo", "env", "command", "exec"}):
        seg = seg[1:]
    if not seg:
        continue
    prog = os.path.basename(seg[0])

    files = [a for a in seg[1:] if not a.startswith("-")]
    if prog == "cp":
        files = files[:-1]  # the destination is written, not read: `cp .env.example .env` is the setup step
    if prog in READERS and any(is_env_file(a) for a in files):
        block("reading .env files is denied (secrets). Name the variable instead; .env.example is fine.")

    if prog != "git":
        continue
    # Skip git global options (-C dir, -c k=v, --no-pager, …) to find the subcommand
    i = 1
    while i < len(seg) and seg[i].startswith("-"):
        i += 2 if seg[i] in {"-C", "-c"} else 1
    if i >= len(seg):
        continue
    sub, args = seg[i], seg[i + 1:]

    if sub in {"commit", "push"} and ("--no-verify" in args or (sub == "commit" and any(re.fullmatch(r"-[a-zA-Z]*n[a-zA-Z]*", a) for a in args))):
        block(f"git {sub} --no-verify skips husky and commitlint. Fix the hook failure instead.")

    if sub == "reset" and "--hard" in args:
        block("git reset --hard discards uncommitted work. Use git stash, or ask the user to run it.")

    if sub == "push":
        positional, skip = [], False
        for a in args:
            if skip:
                skip = False
            elif a in {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}:
                skip = True
            elif not a.startswith("-"):
                positional.append(a)
        refspecs = positional[1:]  # first positional is the remote
        if not refspecs:
            if current_branch() in PROTECTED:
                block(f"bare git push while on '{current_branch()}'. Push a feature branch and open a PR/MR.")
            continue
        for r in refspecs:
            dst = r.lstrip("+").split(":")[-1]
            dst = dst[len("refs/heads/"):] if dst.startswith("refs/heads/") else dst
            src_is_head = ":" not in r and r.lstrip("+") == "HEAD"
            if dst in PROTECTED or (src_is_head and current_branch() in PROTECTED):
                block(f"direct push to '{dst if dst in PROTECTED else current_branch()}' is not allowed. Push a feature branch and open a PR/MR.")
sys.exit(0)
PY
