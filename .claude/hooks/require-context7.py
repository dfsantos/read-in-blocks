#!/usr/bin/env python3
"""PreToolUse hook: block stack changes that were not preceded by a Context7 docs lookup.

Policy: docs/architecture/stack-docs-policy.md (ADR-0013).

Covered actions:
  * Bash: dependency commands (pnpm/npm/yarn/bun add|install <pkg>|update|remove, dlx/npx, shadcn,
    drizzle-kit, create-*), also behind global flags, absolute paths, corepack/npx, `sh -c`, `eval`,
    subshells and blocks; writes to package.json, lockfiles and stack config files done through the shell
  * Edit/Write/MultiEdit: package.json dependency changes, stack config files, lockfile (forbidden)

A package is "covered" when the session transcript contains a successful Context7 `query-docs` call
  * made through a trusted server (`mcp__Context7__…` or a connector id listed under `trustedServers`
    in .claude/context7-exceptions.json),
  * whose Context7-style `libraryId` (/org/project[/version]) was returned earlier in the session by a
    successful `resolve-library-id` call, or is a known id in LIBRARY_IDS,
  * whose result is not empty and not a "library not found" answer,
  * and whose `libraryId` names the package: its project segment is the package name, or it matches
    one of the ids LIBRARY_IDS lists for the package (or its scope). The free-text `query` never counts.
Packages listed under `exceptions` in .claude/context7-exceptions.json are allowed (approved by the
project owner).

Stable versions only: pre-release specs (rc, beta, alpha, canary, next, nightly, dev, x.y.z-suffix) are
blocked unless the package is listed under `prereleaseApproved` in the exceptions file.

Exit 0 = allow; exit 2 = block (stderr is shown to the agent).
"""
import fnmatch
import json
import os
import re
import shlex
import sys

# package (or scope) -> Context7 library ids (fnmatch patterns on /org/project) that document it.
# A package whose name is the project segment of the consulted id needs no entry here.
LIBRARY_IDS = {
    "next": ["/vercel/next.js"],
    "@next": ["/vercel/next.js"],
    "create-next-app": ["/vercel/next.js"],
    "eslint-config-next": ["/vercel/next.js"],
    "react": ["/websites/react_dev", "/facebook/react", "/reactjs/react.dev"],
    "react-dom": ["/websites/react_dev", "/facebook/react", "/reactjs/react.dev"],
    "tailwindcss": ["/tailwindlabs/tailwindcss.com", "/websites/tailwindcss"],
    "@tailwindcss": ["/tailwindlabs/tailwindcss.com", "/websites/tailwindcss"],
    "postcss": ["/websites/tailwindcss"],
    "shadcn": ["/shadcn-ui/ui"],
    "@base-ui": ["/shadcn-ui/ui"],
    "class-variance-authority": ["/shadcn-ui/ui"],
    "tailwind-merge": ["/shadcn-ui/ui"],
    "tw-animate-css": ["/shadcn-ui/ui"],
    "lucide-react": ["/shadcn-ui/ui"],
    "sonner": ["/shadcn-ui/ui"],
    "drizzle-orm": ["/drizzle-team/drizzle-orm-docs", "/drizzle-team/drizzle-orm"],
    "drizzle-kit": ["/drizzle-team/drizzle-orm-docs", "/drizzle-team/drizzle-orm"],
    "pg": ["/brianc/node-postgres"],
    "@neondatabase": ["/neondatabase/*"],
    "vercel": ["/vercel/vercel", "/websites/vercel"],
    "@vercel": ["/websites/vercel"],
    "@better-auth": ["/better-auth/better-auth"],
    "next-intl": ["/amannn/next-intl"],
    "zod": ["/colinhacks/zod", "/websites/zod_dev"],
    "@hookform": ["/react-hook-form/resolvers"],
    "@tiptap": ["/ueberdosis/tiptap", "/ueberdosis/tiptap-docs"],
    "vite": ["/vitest-dev/vitest"],
    "@vitest": ["/vitest-dev/vitest"],
    "@testing-library": ["/testing-library/*"],
    "jsdom": ["/testing-library/*"],
    "@playwright": ["/microsoft/playwright"],
    "@commitlint": ["/conventional-changelog/commitlint"],
    "@typescript-eslint": ["/typescript-eslint/typescript-eslint"],
    "typescript": ["/microsoft/typescript"],
    "github actions": ["/websites/github_en*", "/actions/*"],
    "dependabot": ["/websites/github_en*", "/dependabot/*"],
}

# stack config file (glob on basename or path suffix) -> package it configures
CONFIG_FILES = [
    ("next.config.*", "next"),
    ("drizzle.config.*", "drizzle-orm"),
    ("components.json", "shadcn"),
    ("tailwind.config.*", "tailwindcss"),
    ("postcss.config.*", "postcss"),
    ("eslint.config.*", "eslint"),
    (".eslintrc*", "eslint"),
    ("vitest.config.*", "vitest"),
    ("playwright.config.*", "@playwright/test"),
    ("commitlint.config.*", "@commitlint/cli"),
    (".commitlintrc*", "@commitlint/cli"),
    ("tsconfig*.json", "typescript"),
    ("vercel.json", "vercel"),
    (".prettierrc*", "prettier"),
    ("prettier.config.*", "prettier"),
    ("*/.github/workflows/*.yml", "github actions"),
    ("*/.github/workflows/*.yaml", "github actions"),
    ("*/.github/dependabot.yml", "dependabot"),
]
LOCKFILES = ("pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock")

NON_DEP_KEYS = {"name", "version", "packageManager", "node", "npm", "pnpm", "yarn", "description",
                "main", "type", "license", "private", "author", "homepage"}
VERSION_VALUE_RE = re.compile(r'^(?:[\^~<>=*]|\d|latest|next|workspace:|npm:|catalog:|link:|file:|github:)')
PMS = {"pnpm", "npm", "yarn", "bun"}
PM_RUNNERS = {"npx", "bunx", "pnpx"}
# Flags (before or after the subcommand) that take a separate value. pnpm's `-w` is a boolean
# (--workspace-root); npm's `-w` takes a workspace name.
FLAGS_WITH_VALUE = {"--filter", "-F", "--filter-prod", "--prefix", "--cwd", "-C", "--dir", "--workspace",
                    "--workspace-dir", "--registry", "--tag", "--loglevel", "--reporter", "--config"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
WRAPPERS = {"sudo", "doas", "time", "env", "nice", "nohup", "exec", "command", "builtin", "stdbuf",
            "timeout", "xargs"}
WRAPPER_FLAGS_WITH_VALUE = {
    "sudo": {"-u", "-g", "-C", "-h", "-p", "-U"}, "doas": {"-u", "-C"}, "env": {"-u", "-C"},
    "nice": {"-n"}, "timeout": {"-s", "-k"}, "stdbuf": {"-i", "-o", "-e"},
    "xargs": {"-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a"},
}
# Commands that only read the files they name (shell redirections are checked separately).
READ_ONLY = {"cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "ag", "jq", "wc",
             "diff", "cmp", "ls", "stat", "file", "echo", "printf", "test", "[", "realpath", "readlink",
             "bat", "sort", "uniq", "sha256sum", "md5sum", "basename", "dirname", "code",
             # tools that read a config file passed as an argument
             "tsc", "eslint", "vitest", "playwright", "next", "drizzle-kit", "shadcn", "prettier"}
IN_PLACE_EDITORS = {"sed", "perl", "awk", "gawk", "ruby"}
GIT_READ_ONLY = {"diff", "log", "show", "status", "blame", "grep", "ls-files", "add", "commit", "rev-parse",
                 "cat-file", "shortlog", "whatchanged", "difftool"}
COPY_LIKE = {"cp", "ln", "install", "rsync"}
PATCHERS = {"patch"}
GIT_PATCHERS = {"apply", "am"}

# Context7 library ids: /org/project or /org/project/version (e.g. /vercel/next.js/v16.2.9).
LIBRARY_ID_RE = re.compile(r"^/[\w.-]+/[\w.-]+(?:/[\w.-]+)?$")
LIBRARY_ID_IN_TEXT_RE = re.compile(r"(?<![\w.-])/[\w.-]+/[\w.-]+(?:/[\w.-]+)?")
# Answers that mean "nothing was found", checked at the start of a result (Context7 keeps them short).
NOT_FOUND_RE = re.compile(
    r"(?i)(?:\bnot\s+found\b|\bno\s+(?:matching\s+)?(?:librar(?:y|ies)|documentation|docs|results?)\b"
    r"|\bdoes\s+not\s+exist\b|\bunknown\s+library\b|\bfailed\s+to\s+(?:fetch|retrieve)\b)")
NOT_FOUND_WINDOW = 300


def block(message: str) -> None:
    sys.stderr.write("Stack change blocked (Context7 docs-first policy, ADR-0013):\n" + message + "\n"
                     "See docs/architecture/stack-docs-policy.md\n")
    sys.exit(2)


def project_dir() -> str:
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def load_config() -> dict:
    path = os.path.join(project_dir(), ".claude", "context7-exceptions.json")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_exceptions(config: dict) -> set:
    return {str(e["package"]).lower() for e in config.get("exceptions", [])
            if isinstance(e, dict) and e.get("package")}


def load_prerelease_approved(config: dict) -> set:
    return {str(x).lower() for x in config.get("prereleaseApproved", [])}


def load_trusted_servers(config: dict) -> set:
    """MCP server names whose `resolve-library-id`/`query-docs` tools are Context7: the server named
    "Context7" plus connector ids approved by the owner (e.g. Claude Desktop's generated ids)."""
    servers = {"context7"}
    for entry in config.get("trustedServers", []):
        name = entry.get("server") if isinstance(entry, dict) else entry
        if name:
            servers.add(str(name).lower())
    return servers


PRERELEASE_TAGS = r"(?:rc|beta|alpha|canary|next|nightly|dev|experimental|preview|insiders)"
PRERELEASE_CMD_RE = re.compile(
    r"(?<=[\w/.-])@(?:" + PRERELEASE_TAGS + r"(?=\s|$)|\d+\.\d+\.\d+-[0-9A-Za-z.-]+)")
PRERELEASE_VALUE_RE = re.compile(r"^(?:" + PRERELEASE_TAGS + r"|[\^~]?\d+\.\d+\.\d+-[0-9A-Za-z.-]+)$")


def prerelease_from_command(command: str) -> list:
    command = strip_heredocs(command)
    found = []
    for tok in command.split():
        if PRERELEASE_CMD_RE.search(tok):
            found.append(tok.strip("'\""))
    return found


def prerelease_deps(text: str) -> list:
    out = []
    for key, value in re.findall(r'"((?:@[\w.-]+/)?[\w.-]+)"\s*:\s*"([^"]*)"', text):
        if key not in NON_DEP_KEYS and PRERELEASE_VALUE_RE.match(value):
            out.append(f"{key}@{value}")
    return out


# --- transcript: which Context7 libraries were really consulted -----------------------------------

def context7_tool(tool_name: str, trusted: set):
    """'resolve' or 'query' for a Context7 tool on a trusted server, else None."""
    if not tool_name.startswith("mcp__"):
        return None
    server, _, tool = tool_name[len("mcp__"):].rpartition("__")
    if server.lower() not in trusted:
        return None
    return {"resolve-library-id": "resolve", "query-docs": "query"}.get(tool)


def result_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(p.get("text", "")) for p in content if isinstance(p, dict))
    return ""


def is_not_found(text: str) -> bool:
    text = text.strip()
    return not text or bool(NOT_FOUND_RE.search(text[:NOT_FOUND_WINDOW]))


def base_id(library_id: str) -> str:
    return "/".join(library_id.lower().split("/")[:3])


def known_id(library_id: str) -> bool:
    base = base_id(library_id)
    return any(fnmatch.fnmatch(base, p) for patterns in LIBRARY_IDS.values() for p in patterns)


def consulted_ids(transcript_path: str, trusted: set) -> list:
    """Context7 library ids (lowercase) of every `query-docs` call in the session that went through a
    trusted server, used an id resolved earlier in the session (or a known one) and got a real answer."""
    pending, resolved, consulted = {}, set(), []
    try:
        with open(transcript_path, encoding="utf-8") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except Exception:
                    continue
                content = (entry.get("message") or {}).get("content")
                if not isinstance(content, list):
                    continue
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    if part.get("type") == "tool_use" and part.get("id"):
                        kind = context7_tool(str(part.get("name", "")), trusted)
                        if not kind:
                            continue
                        library_id = str((part.get("input") or {}).get("libraryId", ""))
                        # The id must be known before the query is made, not resolved afterwards.
                        ready = kind == "resolve" or (
                            LIBRARY_ID_RE.match(library_id)
                            and (base_id(library_id) in resolved or known_id(library_id)))
                        pending[part["id"]] = (kind, library_id, bool(ready))
                    elif part.get("type") == "tool_result" and part.get("tool_use_id") in pending:
                        kind, library_id, ready = pending.pop(part["tool_use_id"])
                        text = result_text(part.get("content"))
                        if part.get("is_error") or not ready or is_not_found(text):
                            continue
                        if kind == "resolve":
                            resolved.update(base_id(m) for m in LIBRARY_ID_IN_TEXT_RE.findall(text))
                        else:
                            consulted.append(library_id.lower())
    except Exception:
        return []
    return consulted


def normalize(name: str) -> str:
    """Project/package name without docs-site suffixes and punctuation (next.js -> next)."""
    name = name.lower().lstrip("@")
    stripped = name
    while True:
        shorter = re.sub(r"[-_.]?(?:docs|dev|com|io|org|js|llms(?:-full)?_txt)$", "", stripped)
        if shorter == stripped or not shorter:
            break
        stripped = shorter
    return re.sub(r"[^a-z0-9]", "", stripped)


def keys_for(pkg: str) -> list:
    pkg = pkg.lower()
    if pkg.startswith("@types/"):
        return [pkg.split("/", 1)[1]]  # the underlying library must be covered
    keys = [pkg]
    if pkg.startswith("@") and "/" in pkg:
        keys.append(pkg.split("/")[0])
    return keys


def covered(pkg: str, library_ids: list) -> bool:
    for library_id in library_ids:
        base = base_id(library_id)
        project = base.split("/")[2] if base.count("/") == 2 else ""
        for key in keys_for(pkg):
            if any(fnmatch.fnmatch(base, p) for p in LIBRARY_IDS.get(key, [])):
                return True
            if project and normalize(project) == normalize(key):
                return True
    return False


# --- Bash parsing ---------------------------------------------------------------------------------

def clean_pkg(token: str) -> str:
    token = token.strip("'\"")
    if token.startswith("@"):
        head, _, rest = token[1:].partition("@")
        return "@" + head
    return token.split("@", 1)[0]


def strip_heredocs(command: str) -> str:
    return re.sub(r"<<-?\s*['\"]?(\w+)['\"]?\s*\n.*?\n\s*\1\b", " ", command, flags=re.S)


SHELL_C_RE = re.compile(
    r"(?:\b(?:ba|z|da|k)?sh\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*c[a-zA-Z]*|\beval)\s+"
    r"(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\")")
REDIRECT_TARGET_RE = re.compile(r"(?:(?<![-=>])\d*|&)>>?\|?\s*(['\"]?)([^\s'\";&|<>()]+)\1")
REDIRECT_RE = re.compile(r"\d*(?:>>?|<|&>)&?\|?\s*\S*")
SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||;|\|&?|&|\n|\$\(|`|\(|\)|(?<![$\w]){|}")


def protected_kind(token: str):
    """('lockfile'|'package.json'|'config', package) for a path to a protected file, else None."""
    token = token.strip("'\"")
    if "=" in token:
        token = token.split("=", 1)[1]  # of=package.json, --file=...
    if not token or token.startswith("-"):
        return None
    base = os.path.basename(token.rstrip("/"))
    if base in LOCKFILES:
        return ("lockfile", base)
    if base == "package.json":
        return ("package.json", base)
    pkg = config_package(token)
    return ("config", pkg) if pkg else None


def split_words(segment: str) -> list:
    try:
        return shlex.split(segment)
    except ValueError:
        return segment.split()


def strip_prefixes(words: list) -> list:
    while words:
        name = os.path.basename(words[0])
        if re.match(r"^\w+=", words[0]):
            words = words[1:]
        elif name in WRAPPERS:
            with_value = WRAPPER_FLAGS_WITH_VALUE.get(name, set())
            words = words[1:]
            while words and (words[0].startswith("-") or re.match(r"^\w+=", words[0])
                             or re.fullmatch(r"\d+(?:\.\d+)?[smhd]?", words[0])):
                words = words[2:] if words[0] in with_value else words[1:]
        else:
            break
    return words


def non_flag_args(args: list, pm: str = "") -> list:
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a.startswith("-"):
            if "=" not in a and (a in FLAGS_WITH_VALUE or (a == "-w" and pm != "pnpm")):
                skip = True
            continue
        out.append(a)
    return out


def analyze_pm(words: list, project: str) -> list:
    pm = os.path.basename(words[0])
    i = 1
    while i < len(words) and words[i].startswith("-"):  # global flags before the subcommand
        flag = words[i]
        takes_value = "=" not in flag and (flag in FLAGS_WITH_VALUE or (flag == "-w" and pm != "pnpm"))
        i += 2 if takes_value else 1
    if i >= len(words):
        return []
    sub, args = words[i], words[i + 1:]
    if pm == "yarn" and sub == "workspace" and len(args) >= 2:
        sub, args = args[1], args[2:]
    rest = non_flag_args(args, pm)
    if sub in ("dlx", "x") and rest:
        first = os.path.basename(clean_pkg(rest[0]))
        if first in PMS or first in PM_RUNNERS or first == "corepack":
            return analyze_words(args_from(args, rest), project)
        return [clean_pkg(rest[0])]
    if sub == "exec" and rest:
        return analyze_words(args_from(args, rest), project)
    if sub == "create":
        return ["create-" + clean_pkg(rest[0])] if rest else []
    if sub in ("add", "install", "i", "update", "up", "upgrade", "remove", "rm", "uninstall", "un"):
        targets = [clean_pkg(a) for a in rest]
        if targets:
            return targets
        if sub in ("update", "up", "upgrade"):
            return all_declared_deps(project)  # updates everything
        return []
    if sub in ("drizzle-kit", "shadcn") or sub.startswith("shadcn@"):
        return [clean_pkg(sub)]  # local bin invoked through the package manager
    return []


def args_from(args: list, rest: list) -> list:
    """`args` starting at the first positional argument (the command to run)."""
    return args[args.index(rest[0]):]


def analyze_words(words: list, project: str) -> list:
    words = strip_prefixes(words)
    if not words:
        return []
    name = os.path.basename(words[0])
    if name in PMS and len(words) >= 2:
        return analyze_pm(words, project)
    if name == "corepack":
        return analyze_words(words[1:], project)
    if name in PM_RUNNERS:
        rest = non_flag_args(words[1:])
        if not rest:
            return []
        if os.path.basename(clean_pkg(rest[0])) in PMS:
            return analyze_words(args_from(words[1:], rest), project)
        return [clean_pkg(rest[0])]
    if name in ("drizzle-kit", "shadcn") or name.startswith("shadcn@"):
        return [clean_pkg(name)]
    return []


def edited_files(words: list, raw_command: str, project: str) -> list:
    """Protected files a shell command (other than a package-manager command) writes or may write."""
    words = strip_prefixes(words)
    if not words:
        return []
    name = os.path.basename(words[0])
    args = words[1:]
    if name in PMS or name in PM_RUNNERS or name in SHELLS or name == "corepack":
        return []
    cited = [k for k in (protected_kind(a) for a in args) if k]
    if name == "git":
        sub = non_flag_args(args)
        sub = sub[0] if sub else ""
        if sub in GIT_PATCHERS:
            return patched_files(args, raw_command, project)
        return [] if sub in GIT_READ_ONLY else cited
    if name in PATCHERS:
        return patched_files(args, raw_command, project)
    if not cited:
        return []
    if name in IN_PLACE_EDITORS:
        in_place = any(re.match(r"^-[a-zA-Z]*i", a) or a.startswith("--in-place") or a == "inplace"
                       for a in args)
        return cited if in_place else []
    if name == "find":
        return cited if any(a in ("-delete", "-exec", "-execdir", "-ok", "-okdir") for a in args) else []
    if name in COPY_LIKE:
        targets = non_flag_args(args)
        if not targets:
            return []
        dest = targets[-1]
        dest_kind = protected_kind(dest)
        if dest_kind:
            return [dest_kind]
        if dest in (".", "..") or dest.endswith("/") or os.path.isdir(os.path.join(project, dest)):
            return [k for k in (protected_kind(t) for t in targets[:-1]) if k]
        return []
    if name in READ_ONLY:
        return []
    return cited  # unknown command naming a protected file: assume it may write it


def patched_files(args: list, raw_command: str, project: str) -> list:
    """A patch touches protected files when the patch text (inline heredoc or patch file) names them."""
    texts = [raw_command]
    for a in non_flag_args(args):
        try:
            with open(os.path.join(project, a), encoding="utf-8", errors="replace") as fh:
                texts.append(fh.read())
        except Exception:
            pass
    found = []
    for text in texts:
        for token in re.findall(r"[\w./@-]+", text):
            kind = protected_kind(token)
            if kind and kind not in found:
                found.append(kind)
    return found


def analyze_bash(command: str, project: str):
    """(packages touched by stack commands, protected files written) for a shell command."""
    commands = [command]
    i = 0
    while i < len(commands):  # `sh -c '…'` and `eval "…"` bodies are analyzed as commands too
        for single, double in SHELL_C_RE.findall(strip_heredocs(commands[i])):
            commands.append(single or double.replace('\\"', '"'))
        i += 1
    pkgs, edits = [], []
    for raw in commands:
        text = strip_heredocs(raw)
        for _, target in REDIRECT_TARGET_RE.findall(text):
            kind = protected_kind(target)
            if kind:
                edits.append(kind)
        text = REDIRECT_RE.sub(" ", text)
        for segment in SEGMENT_SPLIT_RE.split(text):
            words = split_words(segment)
            if not words:
                continue
            pkgs += analyze_words(words, project)
            edits += edited_files(words, raw, project)
    return list(dict.fromkeys(p for p in pkgs if p)), list(dict.fromkeys(edits))


def all_declared_deps(project: str) -> list:
    try:
        with open(os.path.join(project, "package.json"), encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return []
    names = []
    for key in ("dependencies", "devDependencies", "optionalDependencies"):
        names += list((data.get(key) or {}).keys())
    return names


def deps_from_package_json_text(text: str) -> list:
    names = []
    for key, value in re.findall(r'"((?:@[\w.-]+/)?[\w.-]+)"\s*:\s*"([^"]*)"', text):
        if key in NON_DEP_KEYS:
            continue
        if VERSION_VALUE_RE.match(value):
            names.append(key)
    return list(dict.fromkeys(names))


def new_text(tool: str, tool_input: dict) -> str:
    if tool == "Write":
        return tool_input.get("content", "")
    if tool == "Edit":
        return tool_input.get("new_string", "")
    if tool == "MultiEdit":
        return "\n".join(e.get("new_string", "") for e in tool_input.get("edits", []))
    return ""


def config_package(path: str):
    norm = path.replace("\\", "/")
    base = os.path.basename(norm)
    for pattern, pkg in CONFIG_FILES:
        if fnmatch.fnmatch(base, pattern) or fnmatch.fnmatch(norm, pattern) or fnmatch.fnmatch("/" + norm, pattern):
            return pkg
    return None


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never block on malformed hook input
    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input") or {}
    project = project_dir()
    config = load_config()
    needed = []

    if tool == "Bash":
        needed, edits = analyze_bash(tool_input.get("command", ""), project)
        if any(kind == "lockfile" for kind, _ in edits):
            block("lockfiles are generated by the package manager and must never be edited by hand "
                  "(this command writes, moves, restores or patches one).")
        if any(kind == "package.json" for kind, _ in edits):
            block("this command writes, moves, restores or patches package.json through the shell, so the\n"
                  "dependencies it sets cannot be checked. Use the package manager (`pnpm add …`) or the\n"
                  "Edit/Write tools, after the Context7 lookup for each dependency.")
        needed += [pkg for kind, pkg in edits if kind == "config" and pkg not in needed]
    elif tool in ("Edit", "Write", "MultiEdit"):
        path = tool_input.get("file_path", "")
        base = os.path.basename(path)
        if base in LOCKFILES:
            block("lockfiles are generated by the package manager and must never be edited by hand.")
        if base == "package.json":
            needed = deps_from_package_json_text(new_text(tool, tool_input))
        else:
            pkg = config_package(path)
            if pkg:
                needed = [pkg]
    if not needed:
        sys.exit(0)

    approved = load_prerelease_approved(config)
    pre = []
    if tool == "Bash":
        pre = prerelease_from_command(tool_input.get("command", ""))
    elif os.path.basename(tool_input.get("file_path", "")) == "package.json":
        pre = prerelease_deps(new_text(tool, tool_input))
    pre = [x for x in pre if clean_pkg(x).lower() not in approved]
    if pre:
        block("only STABLE versions are allowed (no rc/beta/alpha/canary/next/nightly/dev or x.y.z-suffix):\n"
              + "\n".join(f"  - {x}" for x in pre)
              + "\nUse the stable version from docs/architecture/stack-versions.md. A pre-release needs the owner's "
                "approval recorded under `prereleaseApproved` in .claude/context7-exceptions.json.")

    exceptions = load_exceptions(config)
    library_ids = consulted_ids(data.get("transcript_path", ""), load_trusted_servers(config))
    missing = [p for p in needed if p.lower() not in exceptions and not covered(p, library_ids)]
    if not missing:
        sys.exit(0)

    lines = ["No successful Context7 lookup of a library that documents these packages was found in this session:"]
    lines += [f"  - {p}" for p in missing]
    lines.append("Context7 libraries consulted so far: " + (", ".join(dict.fromkeys(library_ids)) or "none"))
    lines += [
        "Do this first, for EACH package above (not from memory):",
        "  1. mcp__Context7__resolve-library-id  (libraryName + what you intend to do)",
        "  2. mcp__Context7__query-docs          (a libraryId returned by step 1, with version if pinned,",
        "     specific question: current stable version, install/config, breaking changes, requirements)",
        "Only the libraryId counts: its project must be the package name, or the id must be listed for the",
        "package in LIBRARY_IDS (.claude/hooks/require-context7.py). Mentioning the package in the query",
        "does not count. If Context7 does not have the library, stop and ask the user; do not edit",
        ".claude/context7-exceptions.json on your own.",
    ]
    block("\n".join(lines))


if __name__ == "__main__":
    main()
