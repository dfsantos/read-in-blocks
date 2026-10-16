import json, os, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HOOK = os.path.join(ROOT, ".claude", "hooks", "require-context7.py")
ENV = dict(os.environ, CLAUDE_PROJECT_DIR=ROOT)


def transcript(calls):
    """Each call is (name, input) or (name, input, result): result is "ok" (default), "error"
    (failed call), None (no result recorded) or any other string (the result text)."""
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    for n, call in enumerate(calls):
        name, inp, result = (call + ("ok",))[:3]
        use_id = f"toolu_{n}"
        f.write(json.dumps({"type": "assistant", "message": {"content": [
            {"type": "tool_use", "id": use_id, "name": name, "input": inp}]}}) + "\n")
        if result:
            f.write(json.dumps({"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": use_id,
                 "content": "docs" if result in ("ok", "error") else [{"type": "text", "text": result}],
                 "is_error": result == "error"}]}}) + "\n")
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
GEN = "mcp__ccffa570-6f0e-44ac-a2df-d30e2cd29738__"
LUCIDE_ID = "/lucide-icons/lucide"
RESOLVED_LUCIDE = (R, {"libraryName": "lucide", "query": "icons"},
                   f"Available Libraries:\n- Title: Lucide\n- Context7-compatible library ID: {LUCIDE_ID}\n")
VITEST = [(Q, {"libraryId": "/vitest-dev/vitest", "query": "projects"})]
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
    # US-029: only successful calls with a Context7-style libraryId count.
    ("other server's query-docs without libraryId", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("mcp__otherdocs__query-docs", {"topic": "vitest projects"})], 2),
    ("libraryId not in Context7 format", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("mcp__otherdocs__query-docs", {"libraryId": "vitest", "query": "vitest projects"})], 2),
    ("libraryId that is a URL", "Write", {"file_path": "/x/vitest.config.ts", "content": "x"},
     [("mcp__otherdocs__query-docs", {"libraryId": "https://vitest.dev/config", "query": "vitest"})], 2),
    ("versioned libraryId accepted", "Bash", {"command": "pnpm add next"},
     [(Q, {"libraryId": "/vercel/next.js/v16.2.9", "query": "upgrade"})], 0),
    ("failed query-docs call", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"}, "error")], 2),
    ("query-docs call without result", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"}, None)], 2),
    ("package only in unrelated input fields", "Bash", {"command": "pnpm add zod"},
     [(Q, {"libraryId": "/vercel/next.js", "query": "routing", "note": "zod"})], 2),
    ("redirection is not a package", "Bash", {"command": "pnpm install --frozen-lockfile 2>&1 | tail -3"}, [], 0),
    ("redirect target is not a package", "Bash", {"command": "pnpm install > install.log"}, [], 0),
    ("package before a redirection still checked", "Bash", {"command": "pnpm add zod 2>&1"}, [], 2),
    # US-030 (1): only the libraryId covers a package, never the free-text query.
    ("package named only in the query", "Bash", {"command": "pnpm add zod"},
     [(Q, {"libraryId": "/vercel/next.js", "query": "zod next-intl drizzle tiptap"})], 2),
    ("one query cannot cover many packages", "Bash", {"command": "pnpm add next-intl zod"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "use with zod"})], 2),
    ("project segment names the package", "Bash", {"command": "pnpm add lowlight"},
     [(R, {"libraryName": "lowlight", "query": "x"}, "- Context7-compatible library ID: /wooorm/lowlight"),
      (Q, {"libraryId": "/wooorm/lowlight", "query": "register languages"})], 0),
    ("docs-site project name normalized", "Bash", {"command": "pnpm add zod"},
     [(Q, {"libraryId": "/websites/zod_dev", "query": "schemas"})], 0),
    ("org alone does not cover a package", "Bash", {"command": "pnpm add vercel"},
     [(Q, {"libraryId": "/vercel/next.js", "query": "deploy"})], 2),
    ("@types covered by the underlying library", "Bash", {"command": "pnpm add -D @types/react-dom"},
     [(Q, {"libraryId": "/websites/react_dev", "query": "types"})], 0),
    ("block message lists consulted ids", "Bash", {"command": "pnpm add zod"}, NEXT, 2),
    # US-030 (2): the libraryId must come from a successful resolve (or be a known id) and the
    # result must be real documentation.
    ("unmapped id without resolve", "Bash", {"command": "pnpm add lucide"},
     [(Q, {"libraryId": LUCIDE_ID, "query": "icons"})], 2),
    ("unmapped id after successful resolve", "Bash", {"command": "pnpm add lucide"},
     [RESOLVED_LUCIDE, (Q, {"libraryId": LUCIDE_ID, "query": "icons"})], 0),
    ("versioned unmapped id after resolve", "Bash", {"command": "pnpm add lucide"},
     [RESOLVED_LUCIDE, (Q, {"libraryId": LUCIDE_ID + "/v1.2.0", "query": "icons"})], 0),
    ("resolve that returned another id", "Bash", {"command": "pnpm add lucide"},
     [(R, {"libraryName": "lucide", "query": "x"}, "- Context7-compatible library ID: /other/icons"),
      (Q, {"libraryId": LUCIDE_ID, "query": "icons"})], 2),
    ("resolve after the query does not count", "Bash", {"command": "pnpm add lucide"},
     [(Q, {"libraryId": LUCIDE_ID, "query": "icons"}), RESOLVED_LUCIDE], 2),
    ("failed resolve does not count", "Bash", {"command": "pnpm add lucide"},
     [(R, {"libraryName": "lucide", "query": "x"}, "error"), (Q, {"libraryId": LUCIDE_ID, "query": "icons"})], 2),
    ("resolve from untrusted server", "Bash", {"command": "pnpm add lucide"},
     [("mcp__otherdocs__resolve-library-id", {"libraryName": "lucide"}, f"ID: {LUCIDE_ID}"),
      (Q, {"libraryId": LUCIDE_ID, "query": "icons"})], 2),
    ("not-found text without is_error", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"},
       'Library "/amannn/next-intl" not found. Please check the library ID.')], 2),
    ("no documentation found text", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"}, "No documentation found for this query.")], 2),
    ("empty result", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"}, "   ")], 2),
    ("not found deep inside real docs is fine", "Bash", {"command": "pnpm add next-intl"},
     [(Q, {"libraryId": "/amannn/next-intl", "query": "setup"}, "x" * 400 + " returns 404 not found")], 0),
    # US-030 (3): only Context7 servers count.
    ("untrusted server with well-formed id", "Bash", {"command": "pnpm add next-intl"},
     [("mcp__otherdocs__query-docs", {"libraryId": "/amannn/next-intl", "query": "setup"})], 2),
    ("server name containing context7 is not enough", "Bash", {"command": "pnpm add next-intl"},
     [("mcp__evil-context7__query-docs", {"libraryId": "/amannn/next-intl", "query": "setup"})], 2),
    ("unknown generated id not trusted", "Bash", {"command": "pnpm add next-intl"},
     [("mcp__00000000-0000-0000-0000-000000000000__query-docs", {"libraryId": "/amannn/next-intl", "query": "s"})], 2),
    ("trusted generated id resolve + query", "Bash", {"command": "pnpm add lucide"},
     [(GEN + "resolve-library-id", {"libraryName": "lucide"}, f"ID: {LUCIDE_ID}"),
      (GEN + "query-docs", {"libraryId": LUCIDE_ID, "query": "icons"})], 0),
    # US-030 (4): Bash parser.
    ("pnpm -w before add", "Bash", {"command": "pnpm -w add zod"}, [], 2),
    ("pnpm -C dir before add", "Bash", {"command": "pnpm -C . add zod"}, [], 2),
    ("pnpm --filter before add", "Bash", {"command": "pnpm --filter web add zod"}, [], 2),
    ("pnpm --filter= before add", "Bash", {"command": "pnpm --filter=web add zod"}, [], 2),
    ("npm --prefix before install", "Bash", {"command": "npm --prefix . install zod"}, [], 2),
    ("npm -w takes a value", "Bash", {"command": "npm -w web install zod"}, [], 2),
    ("yarn workspace add", "Bash", {"command": "yarn workspace web add zod"}, [], 2),
    ("bun --cwd add", "Bash", {"command": "bun --cwd . add zod"}, [], 2),
    ("global flags, covered", "Bash", {"command": "pnpm -w add next-intl"}, INTL, 0),
    ("absolute pnpm path", "Bash", {"command": "/usr/bin/pnpm add zod"}, [], 2),
    ("relative pnpm path", "Bash", {"command": "./node_modules/.bin/pnpm add zod"}, [], 2),
    ("corepack pnpm", "Bash", {"command": "corepack pnpm add zod"}, [], 2),
    ("npx pnpm", "Bash", {"command": "npx pnpm add zod"}, [], 2),
    ("pnpm dlx pnpm", "Bash", {"command": "pnpm dlx pnpm add zod"}, [], 2),
    ("pnpm dlx create-next-app still checked", "Bash", {"command": "pnpm dlx create-next-app@latest ."}, [], 2),
    ("pnpm exec drizzle-kit", "Bash", {"command": "pnpm exec drizzle-kit generate"}, [], 2),
    ("pnpm exec other bin is fine", "Bash", {"command": "pnpm exec eslint ."}, [], 0),
    ("bash -c", "Bash", {"command": "bash -c 'pnpm add zod'"}, [], 2),
    ("sh -c with double quotes", "Bash", {"command": 'sh -c "cd web && pnpm add zod"'}, [], 2),
    ("bash -lc", "Bash", {"command": "bash -lc 'pnpm add zod'"}, [], 2),
    ("eval", "Bash", {"command": "eval \"pnpm add zod\""}, [], 2),
    ("subshell", "Bash", {"command": "(cd web && pnpm add zod)"}, [], 2),
    ("block", "Bash", {"command": "{ pnpm add zod; }"}, [], 2),
    ("command substitution", "Bash", {"command": "echo $(pnpm add zod)"}, [], 2),
    ("backticks", "Bash", {"command": "echo `pnpm add zod`"}, [], 2),
    ("env and sudo prefixes", "Bash", {"command": "env CI=1 sudo -u me nice -n 5 pnpm add zod"}, [], 2),
    ("env -i prefix", "Bash", {"command": "env -i pnpm add zod"}, [], 2),
    ("timeout prefix", "Bash", {"command": "timeout 60 pnpm add zod"}, [], 2),
    ("xargs", "Bash", {"command": "echo zod | xargs pnpm add"}, [], 0),
    ("sed -i on package.json", "Bash", {"command": "sed -i 's/1.0/2.0/' package.json"}, [], 2),
    ("perl -pi on package.json", "Bash", {"command": "perl -pi -e 's/a/b/' package.json"}, [], 2),
    ("cat > package.json heredoc", "Bash", {"command": "cat > package.json <<'EOF'\n{}\nEOF"}, [], 2),
    ("echo >> package.json", "Bash", {"command": "echo '{}' >> ./package.json"}, [], 2),
    ("tee package.json", "Bash", {"command": "echo '{}' | tee package.json"}, [], 2),
    ("cp over package.json", "Bash", {"command": "cp /tmp/p.json package.json"}, [], 2),
    ("cp into the project dir", "Bash", {"command": "cp /tmp/x/package.json ."}, [], 2),
    ("mv package.json", "Bash", {"command": "mv package.json old.json"}, [], 2),
    ("ln over package.json", "Bash", {"command": "ln -sf /tmp/p.json package.json"}, [], 2),
    ("dd of=package.json", "Bash", {"command": "dd if=/tmp/p of=package.json"}, [], 2),
    ("git checkout -- package.json", "Bash", {"command": "git checkout -- package.json"}, [], 2),
    ("git checkout ref package.json", "Bash", {"command": "git checkout main package.json"}, [], 2),
    ("git restore package.json", "Bash", {"command": "git restore package.json"}, [], 2),
    ("git apply patch touching package.json", "Bash",
     {"command": "git apply <<'EOF'\n--- a/package.json\n+++ b/package.json\nEOF"}, [], 2),
    ("patch touching tsconfig", "Bash", {"command": "patch -p1 <<'EOF'\n--- a/tsconfig.json\nEOF"}, [], 2),
    ("git apply of unrelated patch", "Bash", {"command": "git apply <<'EOF'\n--- a/src/x.ts\n+++ b/src/x.ts\nEOF"}, [], 0),
    ("lockfile written by shell", "Bash", {"command": "git checkout main -- pnpm-lock.yaml"}, NEXT, 2),
    ("lockfile removed by shell", "Bash", {"command": "rm pnpm-lock.yaml"}, [], 2),
    ("unknown command naming package.json", "Bash", {"command": "node scripts/bump.js package.json"}, [], 2),
    ("config written by shell without consult", "Bash", {"command": "cat > vitest.config.ts <<'EOF'\nx\nEOF"}, [], 2),
    ("config written by shell, consulted", "Bash", {"command": "cat > vitest.config.ts <<'EOF'\nx\nEOF"}, VITEST, 0),
    ("sed -i on workflow", "Bash", {"command": "sed -i 's/a/b/' .github/workflows/ci.yml"}, [], 2),
    ("read-only cat/grep/jq", "Bash", {"command": "cat package.json | jq .scripts && grep -n zod package.json"}, [], 0),
    ("read-only sed -n", "Bash", {"command": "sed -n '1,5p' package.json tsconfig.json"}, [], 0),
    ("read-only git diff/log/add/commit", "Bash",
     {"command": "git diff -- package.json && git log -p package.json && git add package.json pnpm-lock.yaml"}, [], 0),
    ("copy from package.json elsewhere", "Bash", {"command": "cp package.json /tmp/backup.json"}, [], 0),
    ("read into other file", "Bash", {"command": "jq .version package.json > /tmp/v.txt 2>&1"}, [], 0),
    ("arrow in a message is not a redirection", "Bash", {"command": "echo 'step -> package.json'"}, [], 0),
    ("tools reading a config", "Bash", {"command": "pnpm exec tsc -p tsconfig.json && vitest --config vitest.config.ts"}, [], 0),
    ("find that only lists", "Bash", {"command": "find . -name package.json -not -path '*/node_modules/*'"}, [], 0),
    ("find -delete", "Bash", {"command": "find . -name tsconfig.json -delete"}, [], 2),
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
