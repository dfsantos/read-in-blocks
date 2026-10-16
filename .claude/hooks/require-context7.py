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

Stable versions only: pre-release specs (rc, beta, alpha, canary, next, nightly, dev, x.y.z-suffix, also
inside ranges such as ^4.0.0-beta.1, and `--tag <pre-release>`) are blocked unless the package is listed
under `prereleaseApproved` in the exceptions file. `npm:` aliases (zod@npm:other) are blocked unless the
alias is listed under `aliasesApproved`; the real package must then be covered.

Self-protection (US-031, ADR-0015): the files that configure this gate (.claude/context7-exceptions.json,
.claude/hooks/**, .claude/settings*.json, .claude/rules/stack-docs.md) and the session transcripts are never
written by the agent, through tools or the shell. Package-manager config (pnpm-workspace.yaml, .npmrc,
.yarnrc*, bunfig.toml) needs a lookup, packages it newly names must be covered, non-default registries are
blocked, and shell writes to it are blocked.

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
    "pnpm": ["/pnpm/pnpm"],
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
    ("pnpm-workspace.yaml", "pnpm"),
    (".npmrc", "pnpm"),
    (".yarnrc", "yarn"),
    (".yarnrc.yml", "yarn"),
    ("bunfig.toml", "bun"),
]
PM_CONFIG_FILES = {"pnpm-workspace.yaml", ".npmrc", ".yarnrc", ".yarnrc.yml", "bunfig.toml"}
# pnpm-workspace.yaml keys whose entries name packages (supply-chain controls)
WORKSPACE_PACKAGE_KEYS = {"allowBuilds", "minimumReleaseAgeExclude", "overrides", "catalog", "catalogs",
                          "onlyBuiltDependencies", "neverBuiltDependencies", "ignoredBuiltDependencies",
                          "patchedDependencies", "packageExtensions", "trustPolicyExclude"}
DEFAULT_REGISTRY = "https://registry.npmjs.org/"
REGISTRY_RE = re.compile(r"(?im)^\s*(?:@[\w.-]+:)?(?:registry|npmRegistryServer)\s*[=:]\s*['\"]?([^'\"\s]+)")
# Files that configure the gate itself, and session transcripts (the proof of a lookup).
GATE_FILE_RE = re.compile(
    r"(?:^|[/'\"\s(=:])\.claude/(?:hooks\b|context7-exceptions\.json\b|settings(?:\.local)?\.json\b"
    r"|rules/stack-docs\.md\b)")
TRANSCRIPT_RE = re.compile(r"\.claude/projects/\S*\.jsonl\b")
INTERPRETERS = {"python", "python3", "node", "nodejs"}
LOCKFILES = ("pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock")

NON_DEP_KEYS = {"name", "version", "packageManager", "node", "npm", "pnpm", "yarn", "description",
                "main", "type", "license", "private", "author", "homepage"}
VERSION_VALUE_RE = re.compile(r'^(?:[\^~<>=*]|\d|(?:latest|next)$|workspace:|npm:|catalog:|link:|file:|github:)')
PMS = {"pnpm", "npm", "yarn", "yarnpkg", "bun"}
ADD_LIKE = {"add", "install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall",
            "it", "install-test", "update", "up", "upgrade", "udpate", "remove", "rm", "r", "uninstall", "un",
            "unlink"}
UPDATE_ALL = {"update", "up", "upgrade", "udpate"}
PM_SUBCOMMANDS = ADD_LIKE | {"dlx", "x", "exec", "create", "init", "pkg", "workspace", "drizzle-kit", "shadcn"}
MAX_DEPTH = 8
PM_RUNNERS = {"npx", "bunx", "pnpx"}
# Flags (before or after the subcommand) that take a separate value. pnpm's `-w` is a boolean
# (--workspace-root); npm's `-w` takes a workspace name.
FLAGS_WITH_VALUE = {"--filter", "-F", "--filter-prod", "--prefix", "--cwd", "-C", "--dir", "--workspace",
                    "--workspace-dir", "--registry", "--tag", "--loglevel", "--reporter", "--config"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
RESERVED_WORDS = {"if", "then", "elif", "else", "do", "while", "until", "!"}
WRAPPERS = {"sudo", "doas", "time", "env", "nice", "nohup", "exec", "command", "builtin", "stdbuf",
            "timeout", "xargs", "setsid", "unbuffer"}
WRAPPER_FLAGS_WITH_VALUE = {
    "sudo": {"-u", "-g", "-C", "-h", "-p", "-U"}, "doas": {"-u", "-C"}, "env": {"-u", "-C"},
    "nice": {"-n"}, "timeout": {"-s", "-k"}, "stdbuf": {"-i", "-o", "-e"},
    "xargs": {"-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a"},
}
# Commands that only read the files they name (shell redirections are checked separately).
READ_ONLY = {"cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "ag", "jq", "wc",
             "diff", "cmp", "ls", "stat", "file", "echo", "printf", "test", "[", "realpath", "readlink",
             "bat", "sort", "sha256sum", "md5sum", "basename", "dirname", "code",
             # tools that read a config file passed as an argument
             "tsc", "eslint", "vitest", "playwright", "next", "drizzle-kit", "shadcn", "prettier"}
# Flags that make a READ_ONLY command write the files it names.
WRITE_FLAGS = {"sort": {"-o", "--output"}, "prettier": {"--write", "-w"}, "eslint": {"--fix"},
               "tsc": {"--init"}, "next": {"lint"}}
IN_PLACE_EDITORS = {"sed", "perl", "awk", "gawk", "ruby"}
GIT_READ_ONLY = {"diff", "log", "show", "status", "blame", "grep", "ls-files", "add", "commit", "rev-parse",
                 "cat-file", "shortlog", "whatchanged", "difftool", "reset"}  # `reset <path>` only unstages
GIT_FLAGS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
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
    entries = config.get("exceptions", [])
    return {str(e["package"]).lower() for e in (entries if isinstance(entries, list) else [])
            if isinstance(e, dict) and e.get("package")}


def load_prerelease_approved(config: dict) -> set:
    entries = config.get("prereleaseApproved", [])
    return {str(x).lower() for x in (entries if isinstance(entries, list) else [])}


def load_aliases_approved(config: dict) -> set:
    entries = config.get("aliasesApproved", [])
    return {str(x).lower() for x in (entries if isinstance(entries, list) else [])}


def load_trusted_servers(config: dict) -> set:
    """MCP server names whose `resolve-library-id`/`query-docs` tools are Context7: the server named
    "Context7" plus connector ids approved by the owner (e.g. Claude Desktop's generated ids)."""
    servers = {"context7"}
    entries = config.get("trustedServers", [])
    for entry in entries if isinstance(entries, list) else []:
        name = entry.get("server") if isinstance(entry, dict) else entry
        if name:
            servers.add(str(name).lower())
    return servers


PRERELEASE_TAGS = r"(?:rc|beta|alpha|canary|next|nightly|dev|experimental|preview|insiders)"
PRERELEASE_CMD_RE = re.compile(
    r"(?<=[\w/.-])@(?:" + PRERELEASE_TAGS + r"(?=[\s'\"]|$)|[\^~<>=v\s]*\d+\.\d+\.\d+-[0-9A-Za-z.-]+)")
PRERELEASE_TAG_RE = re.compile(r"^" + PRERELEASE_TAGS + r"$")
PRERELEASE_IN_VALUE_RE = re.compile(r"\d+\.\d+\.\d+-[0-9A-Za-z]")
ALIAS_IN_TOKEN_RE = re.compile(r"^((?:@[\w.-]+/)?[\w.-]+)@npm:((?:@[\w.-]+/)?[\w.-]+)")
ALIAS_IN_JSON_RE = re.compile(r'"((?:@[\w.-]+/)?[\w.-]+)"\s*:\s*"npm:((?:@[\w.-]+/)?[\w.-]+)')
ALIAS_IN_YAML_RE = re.compile(r"((?:@[\w.-]+/)?[\w.-]+)['\"]?\s*:\s*['\"]?npm:((?:@[\w.-]+/)?[\w.-]+)")


def prerelease_from_command(command: str) -> list:
    command = strip_heredocs(command)
    found = []
    tokens = [t.strip("'\"") for t in command.split()]
    for n, tok in enumerate(tokens):
        if PRERELEASE_CMD_RE.search(tok):
            found.append(tok)
        tag = tok.split("=", 1)[1] if tok.startswith("--tag=") else (
            tokens[n + 1] if tok == "--tag" and n + 1 < len(tokens) else "")
        if PRERELEASE_TAG_RE.match(tag):
            found.append(f"--tag {tag}")
    return found


def is_prerelease_value(value: str) -> bool:
    value = value.strip().strip("'\"")
    return bool(PRERELEASE_TAG_RE.match(value) or PRERELEASE_IN_VALUE_RE.search(value))


def prerelease_deps(text: str) -> list:
    out = []
    for key, value in re.findall(r'"((?:@[\w.-]+/)?[\w.-]+)"\s*:\s*"([^"]*)"', text):
        if key not in NON_DEP_KEYS and is_prerelease_value(value):
            out.append(f"{key}@{value}")
    return out


def prerelease_yaml(lines: list) -> list:
    out = []
    for line in lines:
        m = re.match(r"^\s*(?:-\s*)?['\"]?((?:@[\w.-]+/)?[\w.-]+)['\"]?\s*:\s*(.+)$", line)
        if m and is_prerelease_value(m.group(2)):
            out.append(f"{m.group(1)}@{m.group(2).strip()}")
    return out


def aliases_from_command(command: str) -> list:
    return [m.groups() for t in strip_heredocs(command).split() if (m := ALIAS_IN_TOKEN_RE.match(t.strip("'\"")))]


def non_default(found: list) -> list:
    return [r for r in found if r.rstrip("/") + "/" != DEFAULT_REGISTRY]


def config_registries(text: str) -> list:
    """Non-default registries set by package-manager config text."""
    return non_default(REGISTRY_RE.findall(text))


def command_registries(command: str) -> list:
    """Non-default registries passed to a command with --registry."""
    found = []
    tokens = [t.strip("'\"") for t in strip_heredocs(command).split()]
    for n, tok in enumerate(tokens):
        if tok.startswith("--registry="):
            found.append(tok.split("=", 1)[1])
        elif tok == "--registry" and n + 1 < len(tokens):
            found.append(tokens[n + 1])
    return non_default(found)


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


def normalize_package(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().lstrip("@"))


def normalize_project(name: str) -> str:
    """Context7 project segment without docs-site suffixes and punctuation (next.js -> next)."""
    name = name.lower()
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
            if project and normalize_project(project) == normalize_package(key):
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
    r"(?:\b(?:ba|z|da|k)?sh\s+(?:[-+]O?o\s+\S+\s+|-[a-zA-Z]+\s+|--[\w-]+\s+)*-[a-zA-Z]*c[a-zA-Z]*|\beval)\s+"
    r"\$?(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\")")
# Inline code run by an interpreter (`python3 -c "…"`, `node -e '…'`): it may write any file it names.
INLINE_CODE_RE = re.compile(
    r"\b(?:python3?|node(?:js)?|perl|ruby|deno|bun)\s+(?:-[\w-]+\s+)*(?:-c|-e|--eval|-p|--print|eval)\s+"
    r"\$?(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\")")
HEREDOC_BODY_RE = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n(.*?)\n\s*\1\b", re.S)
HERESTRING_RE = re.compile(r"<<<\s*\$?(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\"|(\S+))")
QUOTED_RE = re.compile(r"\$?'([^']*)'|\"((?:[^\"\\]|\\.)*)\"")
QUOTED_WITH_SPACE_RE = re.compile(r"'[^'\n]*\s[^'\n]*'|\"(?:[^\"\\\n]|\\.)*\s(?:[^\"\\\n]|\\.)*\"")
REDIRECT_TARGET_RE = re.compile(r"(?:(?<![-=>])\d*|&)>>?\|?\s*(['\"]?)([^\s'\";&|<>()]+)\1")
REDIRECT_RE = re.compile(r"\d*(?:>>?|<|&>)&?\|?\s*\S*")
SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||;|\|&?|&|\n|\$\(|`|\(|\)|(?<![$\w]){|}")


def protected_kind(token: str):
    """('gate'|'transcript'|'lockfile'|'package.json'|'pm-config'|'config', name) for a path to a protected
    file, else None."""
    token = token.strip("'\"")
    norm = token.replace("\\", "/")
    if GATE_FILE_RE.search(norm) or GATE_FILE_RE.search("/" + norm):
        return ("gate", token)
    if TRANSCRIPT_RE.search(norm):
        return ("transcript", token)
    if "=" in token:
        token = token.split("=", 1)[1]  # of=package.json, --file=...
    if not token or token.startswith("-"):
        return None
    base = os.path.basename(token.rstrip("/"))
    if base in LOCKFILES:
        return ("lockfile", base)
    if base == "package.json":
        return ("package.json", base)
    if base in PM_CONFIG_FILES:
        return ("pm-config", base)
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
        if re.match(r"^\w+=", words[0]) or words[0] in RESERVED_WORDS:
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


def analyze_pm(words: list, project: str, depth: int = 0) -> list:
    pm = os.path.basename(words[0])
    pm = "yarn" if pm == "yarnpkg" else pm
    i, after_unknown_flag = 1, False
    while i < len(words):  # global flags before the subcommand, known or not
        word = words[i]
        if word.startswith("-"):
            takes_value = "=" not in word and (word in FLAGS_WITH_VALUE or (word == "-w" and pm != "pnpm"))
            after_unknown_flag = "=" not in word and not takes_value
            i += 2 if takes_value else 1
        elif word in PM_SUBCOMMANDS or word.startswith("shadcn@") or not after_unknown_flag:
            break
        else:  # value of an unknown flag (`--cache /tmp/c`)
            after_unknown_flag = False
            i += 1
    if i >= len(words):
        return []
    sub, args = words[i], words[i + 1:]
    if pm == "yarn" and sub == "workspace" and len(args) >= 2:
        sub, args = args[1], args[2:]
    rest = non_flag_args(args, pm)
    if sub in ("dlx", "x") and rest:
        first = os.path.basename(clean_pkg(rest[0]))
        if first in PMS or first in PM_RUNNERS or first == "corepack":
            return analyze_words(args_from(args, rest), project, depth + 1)
        return [clean_pkg(rest[0])]
    if sub == "exec" and rest:
        return analyze_words(args_from(args, rest), project, depth + 1)
    if sub in ("create", "init") and rest:  # `npm init vite` runs create-vite
        return ["create-" + clean_pkg(rest[0])]
    if sub in ADD_LIKE:
        targets = [clean_pkg(a) for a in rest]
        if targets:
            return targets
        if sub in UPDATE_ALL:
            return all_declared_deps(project)  # updates everything
        return []
    if sub in ("drizzle-kit", "shadcn") or sub.startswith("shadcn@"):
        return [clean_pkg(sub)]  # local bin invoked through the package manager
    return []


def args_from(args: list, rest: list) -> list:
    """`args` starting at the first positional argument (the command to run)."""
    return args[args.index(rest[0]):]


def analyze_words(words: list, project: str, depth: int = 0) -> list:
    if depth > MAX_DEPTH:
        raise ValueError("command nesting too deep")
    words = strip_prefixes(words)
    if not words:
        return []
    name = os.path.basename(words[0])
    if name in PMS and len(words) >= 2:
        return analyze_pm(words, project, depth)
    if name == "corepack":
        return analyze_words(words[1:], project, depth + 1)
    if name in ("node", "nodejs"):  # node …/pnpm/bin/pnpm.cjs add x
        rest = non_flag_args(words[1:])
        script = re.match(r"^(pnpm|npm|yarn|bun)(?:-cli)?\.c?js$", os.path.basename(rest[0])) if rest else None
        if script:
            return analyze_words([script.group(1)] + args_from(words[1:], rest)[1:], project, depth + 1)
        return []
    if name in PM_RUNNERS:
        rest = non_flag_args(words[1:])
        if not rest:
            return []
        if os.path.basename(clean_pkg(rest[0])) in PMS:
            return analyze_words(args_from(words[1:], rest), project, depth + 1)
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
    if name in PMS:
        sub = [a for a in args if not a.startswith("-")]
        if sub and sub[0] == "pkg" and len(sub) > 1 and sub[1] in ("set", "delete", "fix"):
            return [("package.json", "package.json")]  # `npm pkg set dependencies.x=1`
        if sub and sub[0] == "config" and len(sub) > 1 and sub[1] in ("set", "delete", "rm", "edit", "unset"):
            return [("pm-config", ".npmrc")]  # writes .npmrc / .yarnrc
        return []
    if name in PM_RUNNERS or name in SHELLS or name == "corepack":
        return []
    cited = [k for k in (protected_kind(a) for a in args) if k]
    if name in INTERPRETERS and cited and not any(a in ("-c", "-e", "-m", "-p", "--eval", "--print") for a in args):
        rest = non_flag_args(args)  # `python3 .claude/hooks/tests/x.py` runs the script, it does not write it
        if rest and protected_kind(rest[0]) and not any(protected_kind(a) for a in rest[1:]):
            return []
    if name == "git":
        sub, skip = "", False
        for a in args:
            if skip:
                skip = False
            elif a.startswith("-"):
                skip = a in GIT_FLAGS_WITH_VALUE
            else:
                sub = a
                break
        if sub in GIT_PATCHERS:
            return patched_files(args, raw_command, project)
        if sub == "restore" and any(a in ("--staged", "-S") for a in args) \
                and not any(a in ("--worktree", "-W") for a in args):
            return []  # only unstages
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
        writes = WRITE_FLAGS.get(name, set())
        if any(a in writes or any(a.startswith(f + "=") for f in writes if f.startswith("--")) for a in args):
            return cited
        return []
    return cited  # unknown command naming a protected file: assume it may write it


def patched_files(args: list, raw_command: str, project: str) -> list:
    """A patch touches protected files when the patch text (inline heredoc or patch file) names them."""
    texts = [raw_command]
    for a in non_flag_args(args):
        path = os.path.join(project, a)
        try:  # regular files only, bounded: never block on a FIFO or a device
            if os.path.isfile(path) and os.path.getsize(path) <= 1_000_000:
                with open(path, encoding="utf-8", errors="replace") as fh:
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


def stdin_shell(text: str) -> bool:
    """A shell that reads its script from stdin (`… | sh`, `bash <<EOF`, `bash <<< '…'`)."""
    for segment in SEGMENT_SPLIT_RE.split(REDIRECT_RE.sub(" ", HERESTRING_RE.sub(" ", text))):
        words = strip_prefixes(split_words(segment))
        if words and os.path.basename(words[0]) in SHELLS:
            args, skip = [], False
            for a in words[1:]:
                if skip:
                    skip = False
                elif a.startswith(("-", "+")):
                    skip = a in ("-o", "+o", "-O", "+O")
                    if "c" in a.lstrip("-+") and not a.startswith("--"):
                        break  # `-c`: handled by SHELL_C_RE
                else:
                    args.append(a)
            else:
                if not args or args[0] == "-s":
                    return True
    return False


def analyze_bash(command: str, project: str):
    """(packages touched by stack commands, protected files written) for a shell command."""
    commands = [command]
    i = 0
    while i < len(commands):
        if i > 4 * MAX_DEPTH:
            raise ValueError("command nesting too deep")
        raw = re.sub(r"\\\n", " ", commands[i])  # line continuations
        stripped = strip_heredocs(raw)
        # `sh -c '…'` and `eval "…"` bodies are analyzed as commands too
        for single, double in SHELL_C_RE.findall(stripped):
            commands.append(single or double.replace('\\"', '"'))
        if stdin_shell(stripped):  # script fed through stdin: analyze every text that may reach it
            commands += [body for _, body in HEREDOC_BODY_RE.findall(raw)]
            commands += ["".join(m) for m in HERESTRING_RE.findall(raw)]
            commands += ["".join(m) for m in QUOTED_RE.findall(stripped)]
        commands[i] = raw
        i += 1
    pkgs, edits = [], []
    for raw in commands:
        for single, double in INLINE_CODE_RE.findall(strip_heredocs(raw)):
            for token in re.findall(r"[\w./~@-]+", single or double):
                kind = protected_kind(token)
                if kind:
                    edits.append(kind)
        text = strip_heredocs(raw)
        text = re.sub(r"(?m)(^|[\s;&|])#[^\n]*", r"\1", text)  # comments
        for _, target in REDIRECT_TARGET_RE.findall(QUOTED_WITH_SPACE_RE.sub("''", text)):
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


DEP_SECTIONS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")


def dep_map(data) -> dict:
    deps = {}
    if isinstance(data, dict):
        for section in DEP_SECTIONS:
            values = data.get(section)
            if isinstance(values, dict):
                deps.update({f"{section}:{k}": v for k, v in values.items()})
        for key, holder in (("overrides", data), ("overrides", data.get("pnpm") if isinstance(data.get("pnpm"), dict) else {})):
            values = holder.get(key) if isinstance(holder, dict) else None
            if isinstance(values, dict):
                deps.update({f"overrides:{k}": v for k, v in values.items()})
    return deps


def apply_edit(tool: str, tool_input: dict):
    """(file before, file after) for an Edit/MultiEdit/Write, or None when it cannot be computed.
    A Write to a missing file starts from an empty file."""
    path = tool_input.get("file_path", "")
    try:
        if tool == "Write":
            before = ""
            if os.path.isfile(path):
                with open(path, encoding="utf-8") as fh:
                    before = fh.read()
            return before, tool_input.get("content", "")
        with open(path, encoding="utf-8") as fh:
            before = fh.read()
        after = before
        edits = [tool_input] if tool == "Edit" else tool_input.get("edits", [])
        for e in edits:
            old, new = e.get("old_string", ""), e.get("new_string", "")
            if not old or old not in after:
                return None
            after = after.replace(old, new) if e.get("replace_all") else after.replace(old, new, 1)
        return before, after
    except Exception:
        return None


def added_lines(tool: str, tool_input: dict) -> list:
    """Lines of the file after the edit that were not in it before, each with its top-level YAML key."""
    texts = apply_edit(tool, tool_input)
    before, after = texts if texts else ("", new_text(tool, tool_input))
    old = set(before.splitlines())
    out, section = [], None if texts else "?"
    for line in after.splitlines():
        header = re.match(r"^([A-Za-z][\w-]*)\s*:", line)
        if header:
            section = header.group(1)
        if line not in old:
            out.append((section, line))
    return out


def workspace_packages(lines: list) -> list:
    """Packages that new lines of pnpm-workspace.yaml name under supply-chain keys."""
    names = []
    for section, line in lines:
        if section != "?" and section not in WORKSPACE_PACKAGE_KEYS:
            continue
        if re.match(r"^[A-Za-z][\w-]*\s*:", line) and section != "?":
            continue  # the key itself
        m = re.match(r"^\s*(?:-\s*)?['\"]?((?:@[\w.-]+/)?[\w.-]+(?:@[^'\"\s:]+)?)", line)
        if m and not re.match(r"^(?:GHSA|CVE)-", m.group(1), re.I):
            names.append(clean_pkg(m.group(1)))
    return list(dict.fromkeys(n for n in names if n))


def changed_deps_from_edit(tool: str, tool_input: dict):
    """Dependencies an Edit/MultiEdit adds or changes in an existing package.json (compares the file
    before and after the edit), or None when that cannot be computed."""
    texts = apply_edit(tool, tool_input)
    if not texts:
        return None
    try:
        old_deps, new_deps = dep_map(json.loads(texts[0])), dep_map(json.loads(texts[1]))
    except Exception:
        return None
    names = [key.split(":", 1)[1] for key, value in new_deps.items() if old_deps.get(key) != value]
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
    try:
        check(data)
    except SystemExit:
        raise
    except Exception as exc:  # fail closed: an unexpected error must not let a stack change through
        if data.get("tool_name") in ("Bash", "Edit", "Write", "MultiEdit"):
            block(f"the hook could not analyze this action ({type(exc).__name__}); simplify the command "
                  "or split it, and report the case if it keeps happening.")
        sys.exit(0)


def check(data: dict) -> None:
    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input") or {}
    project = project_dir()
    config = load_config()
    needed, aliases, pre_extra = [], [], []
    owner_only = ("is part of the Context7 gate itself (ADR-0015). The agent never changes it, through tools or\n"
                  "the shell: propose the change (diff or text) and ask the project owner to apply it.")

    if tool == "Bash":
        command = tool_input.get("command", "")
        needed, edits = analyze_bash(command, project)
        if any(kind == "gate" for kind, _ in edits):
            block("this command writes, moves, restores or patches a file that " + owner_only)
        if any(kind == "transcript" for kind, _ in edits):
            block("session transcripts are the proof of the Context7 lookups and must never be written by the agent.")
        if any(kind == "lockfile" for kind, _ in edits):
            block("lockfiles are generated by the package manager and must never be edited by hand "
                  "(this command writes, moves, restores or patches one).")
        if any(kind == "package.json" for kind, _ in edits):
            block("this command writes, moves, restores or patches package.json through the shell, so the\n"
                  "dependencies it sets cannot be checked. Use the package manager (`pnpm add …`) or the\n"
                  "Edit/Write tools, after the Context7 lookup for each dependency.")
        if any(kind == "pm-config" for kind, _ in edits):
            block("this command writes package-manager config (pnpm-workspace.yaml, .npmrc, .yarnrc*, bunfig.toml or\n"
                  "`… config set`) through the shell, so its supply-chain settings cannot be checked. Use the\n"
                  "Edit/Write tools, after the Context7 lookup of the package manager.")
        bad = command_registries(command)
        if bad:
            block("only the default npm registry (https://registry.npmjs.org/) is allowed; another registry needs the "
                  "owner's approval:\n" + "\n".join(f"  - {r}" for r in bad))
        needed += [pkg for kind, pkg in edits if kind == "config" and pkg not in needed]
        aliases = aliases_from_command(command)
    elif tool in ("Edit", "Write", "MultiEdit"):
        path = tool_input.get("file_path", "")
        base = os.path.basename(path)
        if protected_kind(path) and protected_kind(path)[0] == "gate":
            block(f"{path} " + owner_only)
        if TRANSCRIPT_RE.search(path.replace("\\", "/")) or path == data.get("transcript_path"):
            block("session transcripts are the proof of the Context7 lookups and must never be written by the agent.")
        if base in LOCKFILES:
            block("lockfiles are generated by the package manager and must never be edited by hand.")
        if base == "package.json":
            changed = changed_deps_from_edit(tool, tool_input) if tool in ("Edit", "MultiEdit") else None
            needed = changed if changed is not None else deps_from_package_json_text(new_text(tool, tool_input))
            aliases = ALIAS_IN_JSON_RE.findall(new_text(tool, tool_input))
        elif base in PM_CONFIG_FILES:
            lines = added_lines(tool, tool_input)
            bad = config_registries("\n".join(line for _, line in lines))
            if bad:
                block("only the default npm registry (https://registry.npmjs.org/) is allowed; another registry needs "
                      "the owner's approval:\n" + "\n".join(f"  - {r}" for r in bad))
            needed = [config_package(path)]
            if base == "pnpm-workspace.yaml":
                needed += [p for p in workspace_packages(lines) if p not in needed]
                aliases = ALIAS_IN_YAML_RE.findall("\n".join(line for _, line in lines))
                pre_extra = prerelease_yaml([line for section, line in lines
                                             if section in ("overrides", "catalog", "catalogs", "?")])
        else:
            pkg = config_package(path)
            if pkg:
                needed = [pkg]
    approved_aliases = load_aliases_approved(config)
    unapproved = [f"{a}@npm:{r}" for a, r in aliases if f"{a}@npm:{r}".lower() not in approved_aliases]
    if unapproved:
        block("`npm:` aliases install a different package than the declared name and need the owner's approval\n"
              "under `aliasesApproved` in .claude/context7-exceptions.json:\n"
              + "\n".join(f"  - {x}" for x in unapproved))
    needed += [r for _, r in aliases if r not in needed]
    if not needed:
        sys.exit(0)

    approved = load_prerelease_approved(config)
    pre = []
    if tool == "Bash":
        pre = prerelease_from_command(tool_input.get("command", ""))
    elif os.path.basename(tool_input.get("file_path", "")) == "package.json":
        pre = prerelease_deps(new_text(tool, tool_input))
    pre += pre_extra
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
