#!/usr/bin/env bash
# PreToolUse (Bash): block commands the team never runs through Claude. Exit 2 blocks the call and
# shows the reason (stderr) to Claude; exit 0 allows it. Covers what permission rules can't express:
#   - git commit/push that skips hooks: --no-verify (or a prefix git accepts), commit -n, HUSKY=0,
#     -c core.hooksPath=…
#   - git push to main or deep-agents (explicit refspec, HEAD/@ or a bare push while on one of them),
#     and push --all / --mirror
#   - git reset --hard: discards uncommitted work
#   - common shell reads of .env files (cat/less/source/grep/cp/< …); .env.example is allowed
# Best effort, not a sandbox: scripts, aliases and `xargs` are not followed.
# If python3 is missing or the input can't be parsed, it allows (never blocks blindly).
input="$(cat)"
command -v python3 >/dev/null 2>&1 || exit 0

HOOK_INPUT="$input" exec python3 - <<'PY'
import json, os, re, shlex, subprocess, sys

PROTECTED = {"main", "deep-agents"}
READERS = {"cat", "less", "more", "head", "tail", "bat", "source", ".", "grep", "rg", "awk", "sed", "xxd",
           "strings", "cp", "base64", "od", "diff", "vim", "vi", "nano", "view"}
WRAPPERS = {"sudo", "env", "command", "exec", "time", "nice", "nohup", "!", "{", "}", "if", "then", "elif",
            "else", "do", "while", "until"}
SHELLS = {"bash", "sh", "zsh"}
SEPARATORS = set(";&|()\n")

try:
    data = json.loads(os.environ["HOOK_INPUT"])
    cmd = data.get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)
if not isinstance(cmd, str) or not cmd:
    sys.exit(0)
base_dir = data.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()

def block(reason):
    print(f"Blocked by .claude/hooks/block-forbidden-command.sh: {reason}", file=sys.stderr)
    sys.exit(2)

def tokenize(text):
    lex = shlex.shlex(text, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""  # bash only starts a comment at a word boundary; never hide a command behind '#'
    return list(lex)

def is_env_file(arg):
    name = os.path.basename(arg)
    return name != ".env.example" and (re.fullmatch(r"\.env(\..+)?", name) is not None or name == ".envrc")

def branch_of(path):
    try:
        return subprocess.run(["git", "-C", path, "branch", "--show-current"],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""

def check(text, cwd, depth=0):
    try:
        tokens = tokenize(text)
    except ValueError:
        tokens = text.split()
    segments, cur = [], []
    for t in tokens:
        if t and set(t) <= SEPARATORS:
            if cur:
                segments.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        segments.append(cur)

    for seg in segments:
        # Redirections: drop the operator and its target (and a bare fd digit before it); `< file` is a read
        args, i = [], 0
        while i < len(seg):
            t = seg[i]
            if t and set(t) <= set("<>&"):
                if args and args[-1].isdigit():
                    args.pop()
                target = seg[i + 1] if i + 1 < len(seg) else ""
                if "<" in t and is_env_file(target):
                    block("reading .env files is denied (secrets). Name the variable instead; .env.example is fine.")
                i += 2
                continue
            args.append(t)
            i += 1

        # Leading VAR=value assignments and wrappers/keywords
        no_hooks_env = False
        while args and (re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", args[0]) or args[0] in WRAPPERS):
            if re.fullmatch(r"HUSKY=0", args[0]):
                no_hooks_env = True
            args = args[1:]
        if not args:
            continue
        prog = os.path.basename(args[0])
        rest = args[1:]

        if prog == "cd" and rest:
            cwd = os.path.join(cwd, os.path.expanduser(rest[0]))
            continue
        if prog in SHELLS and "-c" in rest and depth < 3:
            j = rest.index("-c")
            if j + 1 < len(rest):
                check(rest[j + 1], cwd, depth + 1)
            continue
        if prog == "eval" and depth < 3:
            check(" ".join(rest), cwd, depth + 1)
            continue

        if prog in READERS:
            files = [a for a in rest if not a.startswith("-")]
            if prog == "cp":
                if "-t" in rest:
                    k = rest.index("-t")
                    files = [a for a in files if a != (rest[k + 1] if k + 1 < len(rest) else None)]
                elif not any(a.startswith("--target-directory") for a in rest):
                    files = files[:-1]  # the destination is written, not read: `cp .env.example .env` is setup
            if any(is_env_file(a) for a in files):
                block("reading .env files is denied (secrets). Name the variable instead; .env.example is fine.")

        if prog != "git":
            continue
        # git global options, some with a separate value
        git_dir, hooks_override, i = cwd, False, 0
        while i < len(rest) and rest[i].startswith("-"):
            opt = rest[i]
            if opt in {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"} and i + 1 < len(rest):
                val = rest[i + 1]
                if opt == "-C":
                    git_dir = os.path.join(git_dir, os.path.expanduser(val))
                if opt == "-c" and val.lower().startswith("core.hookspath"):
                    hooks_override = True
                i += 2
            else:
                i += 1
        if i >= len(rest):
            continue
        sub, sargs = rest[i], rest[i + 1:]

        if sub in {"commit", "push"}:
            if no_hooks_env or hooks_override:
                block(f"git {sub} with HUSKY=0 or core.hooksPath skips husky and commitlint. Fix the hook failure instead.")
            if any(a.startswith("--no-v") and "--no-verify".startswith(a) for a in sargs):
                block(f"git {sub} --no-verify skips husky and commitlint. Fix the hook failure instead.")
        if sub == "commit":
            skip = False
            for a in sargs:
                if skip:
                    skip = False
                    continue
                if a == "--":
                    break
                if a.startswith("-") and not a.startswith("--") and len(a) > 1:
                    for k, ch in enumerate(a[1:]):
                        if ch == "n":
                            block("git commit -n (--no-verify) skips husky and commitlint. Fix the hook failure instead.")
                        if ch in "mFCct":
                            skip = k == len(a) - 2  # value is the next token unless attached
                            break
                        if ch in "uS":
                            break  # optional attached value
        if sub == "reset" and any(a.startswith("--ha") and "--hard".startswith(a) for a in sargs):
            block("git reset --hard discards uncommitted work. Use git stash, or ask the user to run it.")

        if sub == "push":
            if any(a in {"--all", "--mirror"} for a in sargs):
                block("git push --all/--mirror also pushes protected branches. Push one feature branch and open a PR/MR.")
            positional, skip, after_dd = [], False, False
            for a in sargs:
                if skip:
                    skip = False
                elif after_dd:
                    positional.append(a)
                elif a == "--":
                    after_dd = True
                elif a in {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}:
                    skip = True
                elif not a.startswith("-"):
                    positional.append(a)
            refspecs = positional[1:]  # the first positional is the remote
            current = branch_of(git_dir)
            if not refspecs:
                if current in PROTECTED:
                    block(f"bare git push while on '{current}'. Push a feature branch and open a PR/MR.")
                continue
            for r in refspecs:
                src = r.lstrip("+").split(":")[0]
                dst = r.lstrip("+").split(":")[-1]
                dst = dst[len("refs/heads/"):] if dst.startswith("refs/heads/") else dst
                if dst in PROTECTED:
                    block(f"direct push to '{dst}' is not allowed. Push a feature branch and open a PR/MR.")
                if ":" not in r and src in {"HEAD", "@"} and current in PROTECTED:
                    block(f"direct push to '{current}' is not allowed. Push a feature branch and open a PR/MR.")

check(cmd, base_dir)
sys.exit(0)
PY
