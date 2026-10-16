// Scopes must match docs/architecture/git-workflow.md and
// .claude/hooks/validate-commit-msg.py (SCOPES).
const scopes = [
  "app",
  "ui",
  "i18n",
  "auth",
  "security",
  "db",
  "library",
  "structure",
  "reading",
  "progress",
  "notes",
  "domain",
  "deps",
  "docs",
  "plan",
  "release",
  "agent",
];

// Dependabot always capitalizes its subject ("Bump x from a to b"), which cannot
// be configured. Only that exact shape is skipped; every other commit and PR
// title still goes through all rules.
const isDependabotBump = (message) =>
  /^(build|ci)\(deps\): Bump \S+ from \S+ to \S+/.test(message);

const config = {
  extends: ["@commitlint/config-conventional"],
  ignores: [isDependabotBump],
  rules: {
    "scope-empty": [2, "never"],
    "scope-enum": [2, "always", scopes],
    "header-max-length": [2, "always", 72],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "body-max-line-length": [2, "always", 100],
  },
};

export default config;
