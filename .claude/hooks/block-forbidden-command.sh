#!/usr/bin/env bash
# PreToolUse (Bash): block commands the team never runs through Claude. Exit 2 blocks the call and
# shows the reason (stderr) to Claude; exit 0 allows it. Covers what permission rules can't express:
#   - git commit/push that skips hooks: --no-verify (or a prefix git accepts), commit -n, HUSKY=0
#     (also `export HUSKY=0`), -c core.hooksPath=… or GIT_CONFIG_* pointing core.hooksPath elsewhere,
#     and `git config` that changes or unsets core.hooksPath (husky's own `.husky/_` is allowed)
#   - git push to main or deep-agents (explicit refspec, HEAD/@ or a bare push while on one of them),
#     and push --all / --mirror
#   - git reset --hard: discards uncommitted work
#   - common shell reads of .env files (cat/less/source/grep/cp/< …, `.env*` globs, `xargs cat`,
#     grep --include=.env / rg -g .env); .env.example is allowed
# Wrapper options are skipped (`nice -n 10`, `sudo -u x`, `env -i`), and `xargs <cmd>` is checked as <cmd>.
# Best effort, not a sandbox: scripts and aliases are not followed.
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
# Wrapper options that take a separate value (`nice -n 10`, `sudo -u root`, `env -u NAME`)
WRAPPER_VALUE_OPTS = {
    "sudo": {"-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T", "--user", "--group", "--chdir"},
    "nice": {"-n", "--adjustment"},
    "env": {"-u", "--unset", "-C", "--chdir", "-S", "--split-string"},
    "time": {"-f", "-o", "--format", "--output"},
    "exec": {"-a"},
}
XARGS_VALUE_OPTS = {"-I", "-i", "-n", "-P", "-L", "-l", "-d", "-a", "-E", "-e", "-s", "--max-args",
                    "--max-procs", "--delimiter", "--arg-file", "--replace"}
HUSKY_HOOKS_PATHS = {".husky/_", ".husky", "./.husky/_", "./.husky"}  # husky's own setting
ENV_SAMPLES = [".env", ".env.local", ".env.production", ".env.development", ".envrc"]
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

HEREDOC = re.compile(r"<<(-?)\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2")
FEEDS_SHELL = re.compile(r"(^|[|;&]|\b(sudo|env|exec|time|nohup)\s)\s*(\S*/)?(bash|sh|zsh)\b")

def heredocs(line):
    # `<<` operators outside quotes and outside $(( )) arithmetic; `<<<` is a here-string
    found, quote, arith, i = [], None, 0, 0
    while i < len(line):
        c = line[i]
        if quote:
            quote = None if c == quote else quote
        elif c in "'\"":
            quote = c
        elif line.startswith("$((", i):
            arith += 1; i += 2
        elif arith and line.startswith("))", i):
            arith -= 1; i += 1
        elif not arith and line.startswith("<<<", i):
            i += 2
        elif not arith and line.startswith("<<", i):
            m = HEREDOC.match(line, i)
            if m:
                found.append(m)
                i = m.end() - 1
        i += 1
    return found

def strip_heredocs(text):
    # Heredoc bodies are data, not commands (`cat > f <<EOF`, `gh pr create --body-file - <<'EOF'`),
    # and an apostrophe in one would break shlex. Keep a body only when it feeds a shell.
    lines, out, i = text.split("\n"), [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        for m in heredocs(line):
            body = []
            while i < len(lines) and (lines[i].lstrip("\t") if m.group(1) else lines[i]) != m.group(3):
                body.append(lines[i])
                i += 1
            i += 1  # the delimiter line
            if FEEDS_SHELL.search(line):
                out.extend(body)
    return "\n".join(out)

def tokenize(text):
    lex = shlex.shlex(text, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""  # bash only starts a comment at a word boundary; never hide a command behind '#'
    return list(lex)

def is_env_file(arg):
    name = os.path.basename(arg)
    if any(c in name for c in "*?["):
        return False  # a glob; is_env_glob decides
    return name != ".env.example" and (re.fullmatch(r"\.env(\..+)?", name) is not None or name == ".envrc")

def is_env_glob(arg, dotfile_rule=True):
    # A glob that would match a .env file: `cat .env*` (the shell skips dotfiles unless the pattern
    # starts with '.'); grep/rg include patterns match any name, so `--include=*.env` counts too
    import fnmatch
    name = os.path.basename(arg)
    if not any(c in name for c in "*?["):
        return False
    if dotfile_rule and not name.startswith("."):
        return False
    return any(fnmatch.fnmatchcase(e, name) for e in ENV_SAMPLES)

def reads_env(arg, dotfile_rule=True):
    return is_env_file(arg) or is_env_glob(arg, dotfile_rule)

def hooks_path_override(assignment):
    # GIT_CONFIG_KEY_<n>=core.hooksPath, GIT_CONFIG_PARAMETERS="'core.hooksPath'=…"
    name, _, value = assignment.partition("=")
    return name.startswith("GIT_CONFIG") and "core.hookspath" in value.lower()

def branch_of(path):
    try:
        return subprocess.run(["git", "-C", path, "branch", "--show-current"],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""

def check(text, cwd, depth=0):
    text = strip_heredocs(text)
    try:
        tokens = tokenize(text)
    except ValueError:  # unbalanced quote: still split on newlines and separators
        tokens = re.sub(r"([;&|()<>\n])", r" \1 ", text).replace("\n", " \n ").split(" ")
        tokens = [t for t in tokens if t]
    env_named = any(reads_env(t) for t in tokens if t and not set(t) <= SEPARATORS)
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
            if re.fullmatch(r"HUSKY=0", args[0]) or hooks_path_override(args[0]):
                no_hooks_env = True
            wrapper, args = args[0], args[1:]
            while wrapper in WRAPPER_VALUE_OPTS or wrapper in {"command", "nohup"}:
                if not args or not args[0].startswith("-") or args[0] == "-":
                    break
                opt, args = args[0], args[1:]
                if opt == "--":
                    break
                if opt in WRAPPER_VALUE_OPTS.get(wrapper, set()) and args:
                    args = args[1:]
        if not args:
            continue
        prog = os.path.basename(args[0])
        rest = args[1:]

        if prog == "export":
            for a in rest:
                if re.fullmatch(r"HUSKY=0", a) or hooks_path_override(a):
                    block("export HUSKY=0 / GIT_CONFIG_* core.hooksPath skips husky and commitlint for every later "
                          "commit. Fix the hook failure instead.")
            continue
        if prog == "xargs" and depth < 3:
            k = 0
            while k < len(rest) and rest[k].startswith("-"):
                k += 2 if rest[k] in XARGS_VALUE_OPTS and k + 1 < len(rest) else 1
            inner = rest[k:]
            if inner and os.path.basename(inner[0]) in READERS and env_named:
                block("reading .env files is denied (secrets). Name the variable instead; .env.example is fine.")
            if inner:
                check(shlex.join(inner), cwd, depth + 1)
            continue
        if prog == "cd" and rest:
            cwd = os.path.join(cwd, os.path.expanduser(rest[0]))
            continue
        flags = [k for k, a in enumerate(rest) if re.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", a)]
        if prog in SHELLS and flags and depth < 3:
            script = [a for a in rest[flags[0] + 1:] if a != "--"]
            if script:
                check(script[0], cwd, depth + 1)
            continue
        if prog == "eval" and depth < 3:
            check(" ".join(rest), cwd, depth + 1)
            continue

        if prog in READERS:
            files = [a for a in rest if not a.startswith("-")]
            if prog in {"grep", "rg", "awk", "sed"} and files and not any(
                    a in {"-e", "-f", "--regexp", "--file"} for a in rest):
                files = files[1:]  # the first operand is the pattern or script, not a file
            if prog == "cp":
                if "-t" in rest:
                    k = rest.index("-t")
                    files = [a for a in files if a != (rest[k + 1] if k + 1 < len(rest) else None)]
                elif not any(a.startswith("--target-directory") for a in rest):
                    files = files[:-1]  # the destination is written, not read: `cp .env.example .env` is setup
            if any(reads_env(a) for a in files):
                block("reading .env files is denied (secrets). Name the variable instead; .env.example is fine.")
            if prog in {"grep", "rg"}:
                patterns = []
                for k, a in enumerate(rest):
                    for opt in ("--include", "--glob", "-g", "--iglob"):
                        if a == opt and k + 1 < len(rest):
                            patterns.append(rest[k + 1])
                        elif a.startswith(opt + "=") and opt.startswith("--"):
                            patterns.append(a.split("=", 1)[1])
                if any(reads_env(p_, dotfile_rule=False) for p_ in patterns):
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
                if opt == "-c" and val.lower().startswith("core.hookspath") and \
                        val.split("=", 1)[-1] not in HUSKY_HOOKS_PATHS:
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
        if sub == "config":
            positional = [a for a in sargs if not a.startswith("-")]
            unset = any(a in {"--unset", "--unset-all"} for a in sargs)
            if positional and positional[0] in {"set", "unset"}:
                unset = unset or positional[0] == "unset"
                positional = positional[1:]
            if positional and positional[0].lower() == "core.hookspath":
                value = positional[1] if len(positional) > 1 else None
                if unset or (value is not None and value not in HUSKY_HOOKS_PATHS):
                    block("changing or unsetting core.hooksPath disables husky and commitlint. "
                          "Fix the hook failure instead.")
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
