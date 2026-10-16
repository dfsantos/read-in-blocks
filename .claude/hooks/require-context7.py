#!/usr/bin/env python3
"""PreToolUse hook: block stack changes that were not preceded by a Context7 docs lookup.

Policy: docs/architecture/stack-docs-policy.md (ADR-0013).

Covered actions:
  * Bash: dependency commands (pnpm/npm/yarn/bun add|install <pkg>|update|remove, dlx/npx, shadcn,
    drizzle-kit, create-*)
  * Edit/Write/MultiEdit: package.json dependency changes, stack config files, lockfile (forbidden)

A package is "covered" when the session transcript contains a Context7 `query-docs` call whose
input mentions the package (or one of its aliases). Packages listed in
.claude/context7-exceptions.json are allowed (approved by the project owner).

Stable versions only: pre-release specs (rc, beta, alpha, canary, next, nightly, dev, x.y.z-suffix) are
blocked unless the package is listed under `prereleaseApproved` in the exceptions file.

Exit 0 = allow; exit 2 = block (stderr is shown to the agent).
"""
import fnmatch
import json
import os
import re
import sys

# package (or scope) -> extra terms that identify its Context7 library
ALIASES = {
    "next": ["next.js", "nextjs"],
    "create-next-app": ["next.js", "nextjs"],
    "eslint-config-next": ["next.js", "nextjs", "eslint"],
    "react-dom": ["react"],
    "tailwindcss": ["tailwind"],
    "@tailwindcss": ["tailwind"],
    "postcss": ["postcss"],
    "autoprefixer": ["autoprefixer", "postcss"],
    "shadcn": ["shadcn"],
    "class-variance-authority": ["class-variance-authority", "cva"],
    "tailwind-merge": ["tailwind-merge", "tailwind"],
    "tw-animate-css": ["tw-animate", "tailwind"],
    "lucide-react": ["lucide"],
    "@radix-ui": ["radix"],
    "radix-ui": ["radix"],
    "drizzle-orm": ["drizzle"],
    "drizzle-kit": ["drizzle"],
    "@neondatabase": ["neon"],
    "pg": ["node-postgres", "postgres"],
    "postgres": ["postgres"],
    "better-auth": ["better-auth"],
    "next-intl": ["next-intl"],
    "@hookform": ["react-hook-form", "hookform"],
    "@tiptap": ["tiptap"],
    "lowlight": ["lowlight"],
    "@vitest": ["vitest"],
    "@testing-library": ["testing-library"],
    "@playwright": ["playwright"],
    "@axe-core": ["axe"],
    "@commitlint": ["commitlint"],
    "lint-staged": ["lint-staged"],
    "@types": [],  # handled specially: the underlying library must be covered
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

NON_DEP_KEYS = {"name", "version", "packageManager", "node", "npm", "pnpm", "yarn", "description",
                "main", "type", "license", "private", "author", "homepage"}
VERSION_VALUE_RE = re.compile(r'^(?:[\^~<>=*]|\d|latest|next|workspace:|npm:|catalog:|link:|file:|github:)')
PM = r"(?:pnpm|npm|yarn|bun)"
FLAGS_WITH_VALUE = {"--filter", "-F", "--prefix", "--cwd", "-C", "--workspace", "-w", "--registry", "--tag"}


def block(message: str) -> None:
    sys.stderr.write("Stack change blocked (Context7 docs-first policy, ADR-0013):\n" + message + "\n"
                     "See docs/architecture/stack-docs-policy.md\n")
    sys.exit(2)


def project_dir() -> str:
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def load_exceptions() -> set:
    path = os.path.join(project_dir(), ".claude", "context7-exceptions.json")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return {e["package"].lower() for e in data.get("exceptions", []) if e.get("package")}
    except Exception:
        return set()


def load_prerelease_approved() -> set:
    path = os.path.join(project_dir(), ".claude", "context7-exceptions.json")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return {str(x).lower() for x in data.get("prereleaseApproved", [])}
    except Exception:
        return set()


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


def is_context7_query(tool_name: str) -> bool:
    """Context7 query tool, whether the MCP server is named "Context7" or registered under a
    generated id (e.g. mcp__<uuid>__query-docs, as in Claude Desktop connectors)."""
    name = tool_name.lower()
    if "context7" in name and "query" in name:
        return True
    return name.startswith("mcp__") and name.endswith("__query-docs")


def consulted_text(transcript_path: str) -> str:
    """Concatenate lowercase inputs of every Context7 query-docs call in the session."""
    chunks = []
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
                    if (isinstance(part, dict) and part.get("type") == "tool_use"
                            and is_context7_query(str(part.get("name", "")))):
                        chunks.append(json.dumps(part.get("input") or {}).lower())
    except Exception:
        return ""
    return "\n".join(chunks)


def terms_for(pkg: str) -> list:
    pkg = pkg.lower()
    scope = pkg.split("/")[0] if pkg.startswith("@") else None
    if scope == "@types":
        return [pkg.split("/", 1)[1]]
    terms = [pkg]
    if scope:
        terms.append(scope.lstrip("@"))
        terms += ALIASES.get(scope, [])
    terms += ALIASES.get(pkg, [])
    return [t for t in dict.fromkeys(terms) if t]


def covered(pkg: str, haystack: str) -> bool:
    for term in terms_for(pkg):
        if len(term) >= 6 or "-" in term or "." in term or " " in term:
            if term in haystack:
                return True
        elif re.search(r"(?<![a-z0-9-])" + re.escape(term) + r"(?![a-z0-9-])", haystack):
            return True
    return False


def clean_pkg(token: str) -> str:
    token = token.strip("'\"")
    if token.startswith("@"):
        head, _, rest = token[1:].partition("@")
        return "@" + head
    return token.split("@", 1)[0]


def strip_heredocs(command: str) -> str:
    return re.sub(r"<<-?\s*['\"]?(\w+)['\"]?\s*\n.*?\n\s*\1\b", " ", command, flags=re.S)


def packages_from_bash(command: str, project: str) -> list:
    """Return packages touched by stack commands, or [] when the command is not one."""
    command = strip_heredocs(command)
    pkgs = []
    segments = re.split(r"(?:&&|\|\||;|\||\n|\$\()", command)
    for seg in segments:
        words = seg.strip().split()
        while words and (re.match(r"^\w+=\S*$", words[0]) or words[0] in ("sudo", "time", "env")):
            words = words[1:]
        if not words:
            continue
        head = words[0]
        if re.fullmatch(PM, head) and len(words) >= 2:
            sub = words[1]
            args = words[2:]
            # `pnpm dlx x`, `pnpm create x`
            if sub in ("dlx", "x") and args:
                rest = [a for a in args if not a.startswith("-")]
                if rest:
                    pkgs.append(clean_pkg(rest[0]))
                continue
            if sub == "create" and args:
                rest = [a for a in args if not a.startswith("-")]
                if rest:
                    pkgs.append("create-" + clean_pkg(rest[0]))
                continue
            if sub in ("add", "install", "i", "update", "up", "upgrade", "remove", "rm", "uninstall", "un"):
                targets, skip = [], False
                for a in args:
                    if skip:
                        skip = False
                        continue
                    if a in FLAGS_WITH_VALUE:
                        skip = True
                        continue
                    if a.startswith("-"):
                        continue
                    targets.append(clean_pkg(a))
                if targets:
                    pkgs += targets
                elif sub in ("update", "up", "upgrade"):
                    pkgs += all_declared_deps(project)  # updates everything
                continue
            # drizzle-kit / shadcn invoked as a local bin through the package manager
            if sub in ("drizzle-kit", "shadcn", "shadcn@latest"):
                pkgs.append(clean_pkg(sub))
                continue
        elif head in ("npx", "bunx"):
            rest = [a for a in words[1:] if not a.startswith("-")]
            if rest:
                pkgs.append(clean_pkg(rest[0]))
        elif head in ("drizzle-kit", "shadcn") or head.startswith("shadcn@"):
            pkgs.append(clean_pkg(head))
    return list(dict.fromkeys(p for p in pkgs if p))


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
    needed = []

    if tool == "Bash":
        needed = packages_from_bash(tool_input.get("command", ""), project)
    elif tool in ("Edit", "Write", "MultiEdit"):
        path = tool_input.get("file_path", "")
        base = os.path.basename(path)
        if base in ("pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"):
            block("lockfiles are generated by the package manager and must never be edited by hand.")
        if base == "package.json":
            needed = deps_from_package_json_text(new_text(tool, tool_input))
        else:
            pkg = config_package(path)
            if pkg:
                needed = [pkg]
    if not needed:
        sys.exit(0)

    approved = load_prerelease_approved()
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

    exceptions = load_exceptions()
    haystack = consulted_text(data.get("transcript_path", ""))
    missing = [p for p in needed if p.lower() not in exceptions and not covered(p, haystack)]
    if not missing:
        sys.exit(0)

    lines = ["No Context7 `query-docs` lookup was found in this session for:"]
    lines += [f"  - {p}" for p in missing]
    lines += [
        "Do this first, for EACH library above (not from memory):",
        "  1. mcp__Context7__resolve-library-id  (libraryName + what you intend to do)",
        "  2. mcp__Context7__query-docs          (libraryId, with version if pinned, specific question:",
        "     current stable version, install/config, breaking changes, requirements)",
        "Then repeat this action using what the docs say. If Context7 does not have the library, stop and",
        "ask the user; do not edit .claude/context7-exceptions.json on your own.",
    ]
    block("\n".join(lines))


if __name__ == "__main__":
    main()
