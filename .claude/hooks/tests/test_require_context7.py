import json, os, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HOOK = os.path.join(ROOT, ".claude", "hooks", "require-context7.py")
ENV = dict(os.environ, CLAUDE_PROJECT_DIR=ROOT)


def transcript(calls):
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    for name, inp in calls:
        f.write(json.dumps({"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": name, "input": inp}]}}) + "\n")
    f.close()
    return f.name


def run(tool, tool_input, calls):
    payload = {"tool_name": tool, "tool_input": tool_input, "transcript_path": transcript(calls)}
    p = subprocess.run([sys.executable, HOOK], input=json.dumps(payload), text=True,
                       capture_output=True, env=ENV)
    return p.returncode, p.stderr


Q = "mcp__Context7__query-docs"
R = "mcp__Context7__resolve-library-id"
NEXT = [(Q, {"libraryId": "/vercel/next.js", "query": "app router setup"})]
INTL = [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"})]
DRIZ = [(Q, {"libraryId": "/drizzle-team/drizzle-orm-docs", "query": "migrations drizzle-kit"})]
TIP = [(Q, {"libraryId": "/ueberdosis/tiptap", "query": "code block lowlight"})]

cases = [
    # (description, tool, input, calls, expected_exit)
    ("add pkg, no consult", "Bash", {"command": "pnpm add next-intl"}, [], 2),
    ("add pkg, resolve only (not query)", "Bash", {"command": "pnpm add next-intl"},
     [(R, {"libraryName": "next-intl"})], 2),
    ("add pkg, covered", "Bash", {"command": "pnpm add next-intl"}, INTL, 0),
    ("add pkg wrong lib consulted", "Bash", {"command": "pnpm add next-intl"}, NEXT, 2),
    ("add two pkgs, one missing", "Bash", {"command": "pnpm add next-intl zod"}, INTL, 2),
    ("scoped tiptap covered via scope", "Bash", {"command": "pnpm add @tiptap/react@latest @tiptap/starter-kit"}, TIP, 0),
    ("dev flag + filter value skipped", "Bash", {"command": "pnpm add -D --filter web vitest"}, [], 2),
    ("install without pkgs = lockfile install", "Bash", {"command": "pnpm install --frozen-lockfile"}, [], 0),
    ("dlx shadcn", "Bash", {"command": "pnpm dlx shadcn@latest add button"}, [], 2),
    ("npx create-next-app", "Bash", {"command": "npx create-next-app@latest ."}, NEXT, 0),
    ("create-next-app no consult", "Bash", {"command": "npx create-next-app@latest ."}, [], 2),
    ("drizzle-kit covered by drizzle", "Bash", {"command": "pnpm exec echo hi && pnpm drizzle-kit generate"}, DRIZ, 0),
    ("drizzle-kit not covered", "Bash", {"command": "pnpm drizzle-kit generate"}, [], 2),
    ("unrelated bash", "Bash", {"command": "git status && ls"}, [], 0),
    ("pnpm test/run not a stack change", "Bash", {"command": "pnpm test && pnpm run build"}, [], 0),
    ("@types needs underlying lib", "Bash", {"command": "pnpm add -D @types/node"}, [], 2),
    ("heredoc body ignored", "Bash", {"command": "cat <<'EOF'\npnpm add evil\nEOF"}, [], 0),
    ("package.json write new dep", "Write", {"file_path": "/x/package.json",
        "content": '{"name":"a","version":"1.0.0","dependencies":{"zod":"^4.0.0"}}'}, [], 2),
    ("package.json write covered", "Write", {"file_path": "/x/package.json",
        "content": '{"name":"a","version":"1.0.0","dependencies":{"zod":"^4.0.0"}}'},
     [(Q, {"libraryId": "/colinhacks/zod", "query": "zod v4"})], 0),
    ("package.json scripts only", "Edit", {"file_path": "/x/package.json",
        "new_string": '"lint": "eslint ."'}, [], 0),
    ("lockfile edit forbidden", "Edit", {"file_path": "/x/pnpm-lock.yaml", "new_string": "x"}, NEXT, 2),
    ("next.config without consult", "Write", {"file_path": "/x/next.config.ts", "content": "export default {}"}, [], 2),
    ("next.config consulted", "Write", {"file_path": "/x/next.config.ts", "content": "export default {}"}, NEXT, 0),
    ("workflow file", "Write", {"file_path": "/x/.github/workflows/ci.yml", "content": "on: push"}, [], 2),
    ("normal source file", "Write", {"file_path": "/x/src/app/page.tsx", "content": "x"}, [], 0),
    ("short term not matching inside other lib", "Bash", {"command": "pnpm add zod"},
     [(Q, {"libraryId": "/lorenwest/node-config", "query": "zodiac"})], 2),
    ("rc blocked even when consulted", "Bash", {"command": "pnpm add drizzle-orm@rc"}, DRIZ, 2),
    ("beta semver blocked even when consulted", "Bash", {"command": "pnpm add better-auth@1.7.0-beta.2"},
     [(Q, {"libraryId": "/better-auth/better-auth", "query": "x"})], 2),
    ("shadcn@latest is not a prerelease", "Bash", {"command": "pnpm dlx shadcn@latest add button"},
     [(Q, {"libraryId": "/shadcn-ui/ui", "query": "cli"})], 0),
    ("scoped @next/ package is not a prerelease tag", "Bash", {"command": "pnpm add -D @next/eslint-plugin-next"}, NEXT, 0),
    ("package.json prerelease value blocked", "Write", {"file_path": "/x/package.json",
        "content": '{"dependencies":{"zod":"4.0.0-beta.1"}}'}, [(Q, {"libraryId": "/colinhacks/zod", "query": "z"})], 2),
    ("package.json stable exact ok", "Write", {"file_path": "/x/package.json",
        "content": '{"dependencies":{"zod":"4.6.5"}}'}, [(Q, {"libraryId": "/colinhacks/zod", "query": "z"})], 0),
    ("context7 server under generated id", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("mcp__ccffa570-6f0e-44ac-a2df-d30e2cd29738__query-docs",
       {"libraryId": "/vitest-dev/vitest", "query": "projects"})], 0),
    ("generated-id resolve only (not query)", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("mcp__ccffa570-6f0e-44ac-a2df-d30e2cd29738__resolve-library-id", {"libraryName": "vitest"})], 2),
    ("non-mcp tool named query-docs ignored", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("fake__query-docs", {"libraryId": "/vitest-dev/vitest", "query": "projects"})], 2),
]

failed = 0
for desc, tool, inp, calls, want in cases:
    code, err = run(tool, inp, calls)
    ok = code == want
    failed += not ok
    print(("PASS" if ok else "FAIL"), f"exit={code} want={want} :: {desc}")
    if not ok:
        print("   ", err.strip()[:300])
print("failed:", failed)
sys.exit(1 if failed else 0)
