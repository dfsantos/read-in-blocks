import json, subprocess, sys

import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HOOK = os.path.join(ROOT, ".claude", "hooks", "validate-commit-msg.py")
HEREDOC_PY = "python3 - <<'EOF'\nimport json\nprint(1)\nEOF\n"
GOOD = "git add -A && git commit -q -m \"$(cat <<'EOF'\nchore(agent): add thing\n\nbody\nEOF\n)\""
BAD = "git add -A && git commit -q -m \"$(cat <<'EOF'\nUpdate things\nEOF\n)\""
cases = [
    ("python heredoc before valid commit", HEREDOC_PY + GOOD, 0),
    ("python heredoc before invalid commit", HEREDOC_PY + BAD, 2),
    ("plain valid", 'git commit -m "feat(auth): add x"', 0),
    ("plain invalid", 'git commit -m "update"', 2),
    ("no commit", HEREDOC_PY, 0),
    ("grep -n in another command then valid commit",
     'grep -n "x" file.md; git add -A && git commit -q -m "chore(agent): add thing"', 0),
    ("commit -n blocked", 'git commit -n -m "chore(agent): add thing"', 2),
    ("commit with bypass flag blocked", 'git commit --no-verify -m "chore(agent): add thing"', 2),
    ("bypass text only inside message is fine", 'git commit -m "chore(agent): explain the -n flag"', 0),
    ("push with -n after commit chain is not a commit flag",
     'git commit -m "chore(agent): add thing" && git push -n origin x', 0),
]
failed = 0
for desc, cmd, want in cases:
    p = subprocess.run([sys.executable, HOOK], input=json.dumps({"tool_input": {"command": cmd}}),
                       text=True, capture_output=True)
    ok = p.returncode == want
    failed += not ok
    print("PASS" if ok else "FAIL", p.returncode, want, desc)
sys.exit(1 if failed else 0)
