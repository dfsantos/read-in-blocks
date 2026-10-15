#!/usr/bin/env python3
"""PreToolUse hook (Bash): block `git commit` whose message is not a Conventional Commit.

Rules mirror docs/architecture/git-workflow.md (ADR-0012). Keep SCOPES in sync with that table.
Exit 0 = allow; exit 2 = block (stderr is shown to the agent).
"""
import json
import re
import sys

TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]
SCOPES = [
    "app", "ui", "i18n", "auth", "security", "db", "library", "structure", "reading",
    "progress", "notes", "domain", "deps", "docs", "plan", "release", "agent",
]
MAX_HEADER = 72
HEADER_RE = re.compile(r"^(?P<type>[a-z]+)\((?P<scope>[a-z0-9-]+)\)(?P<bang>!)?: (?P<subject>\S.*)$")


def fail(msg: str) -> None:
    sys.stderr.write(
        "Commit blocked: " + msg + "\n"
        "Expected Conventional Commits: <type>(<scope>): <subject>\n"
        "  types : " + ", ".join(TYPES) + "\n"
        "  scopes: " + ", ".join(SCOPES) + "\n"
        "  subject: English, imperative, lowercase start, no trailing period, header <= "
        + str(MAX_HEADER) + " chars.\n"
        "Example: feat(library): add book creation form\n"
        "See docs/architecture/git-workflow.md\n"
    )
    sys.exit(2)


def extract_messages(command: str) -> list[str]:
    """Return the first line of every message found in the command (heredoc or -m)."""
    headers: list[str] = []
    # Heredoc: -m "$(cat <<'EOF' ... EOF)"
    for m in re.finditer(r"<<-?\s*['\"]?(\w+)['\"]?\s*\n(.*?)\n\s*\1\b", command, re.S):
        body = m.group(2).strip("\n")
        first = next((ln for ln in body.splitlines() if ln.strip()), "")
        headers.append(first.strip())
    if headers:
        return headers[:1]
    # -m "msg" / -m 'msg' / -m msg / --message=msg (first -m is the subject)
    for m in re.finditer(r"""(?:^|\s)(?:-m|--message)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))""", command):
        text = next(g for g in m.groups() if g is not None)
        headers.append(text.splitlines()[0].strip() if text.strip() else "")
        break
    return headers


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never block on malformed hook input
    command = (data.get("tool_input") or {}).get("command", "")
    if not re.search(r"(^|[;&|\s(])git\s+(?:-C\s+\S+\s+)?commit\b", command):
        sys.exit(0)

    if re.search(r"\s(--no-verify|-n)(\s|$)", command):
        fail("`--no-verify` is not allowed; hooks and commitlint must run.")

    headers = extract_messages(command)
    if not headers:
        # --amend --no-edit, -F file, or editor: cannot be inspected here; commitlint (US-001) covers it.
        sys.exit(0)
    header = headers[0]
    if re.match(r"^(Merge|Revert) ", header):
        sys.exit(0)
    m = HEADER_RE.match(header)
    if not m:
        fail(f'"{header}" does not match <type>(<scope>): <subject>.')
    if m["type"] not in TYPES:
        fail(f'unknown type "{m["type"]}".')
    if m["scope"] not in SCOPES:
        fail(f'unknown scope "{m["scope"]}".')
    if len(header) > MAX_HEADER:
        fail(f"header has {len(header)} chars (max {MAX_HEADER}).")
    subject = m["subject"]
    if subject.endswith("."):
        fail("subject must not end with a period.")
    if subject[0].isupper():
        fail("subject must start in lowercase.")
    sys.exit(0)


if __name__ == "__main__":
    main()
