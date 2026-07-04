---
name: "code-reviewer"
description: Code review automation for TypeScript, JavaScript, Python, Go, Swift, Kotlin. Analyzes PRs for complexity and risk, checks code quality for SOLID violations and code smells, generates review reports. Use when reviewing pull requests, analyzing code quality, identifying issues, generating review checklists.
---

# Code Reviewer

Automated code review tools for analyzing pull requests, detecting code quality issues, and generating review reports.

---

## Table of Contents

- [Tools](#tools)
  - [PR Analyzer](#pr-analyzer)
  - [Code Quality Checker](#code-quality-checker)
  - [Review Report Generator](#review-report-generator)
- [Reference Guides](#reference-guides)
- [Languages Supported](#languages-supported)

---

## Tools

### PR Analyzer

Analyzes git diff between branches to assess review complexity and identify risks.

```bash
# Analyze current branch against main
python scripts/pr_analyzer.py /path/to/repo

# Compare specific branches
python scripts/pr_analyzer.py . --base main --head feature-branch

# JSON output for integration
python scripts/pr_analyzer.py /path/to/repo --json
```

**What it detects:**
- Hardcoded secrets (passwords, API keys, tokens)
- SQL injection patterns (string concatenation in queries)
- Debug statements (debugger, console.log)
- ESLint rule disabling
- TypeScript `any` types
- TODO/FIXME comments

**Output includes:**
- Complexity score (1-10)
- Risk categorization (critical, high, medium, low)
- File prioritization for review order
- Commit message validation

---

### Code Quality Checker

Analyzes source code for structural issues, code smells, and SOLID violations.

```bash
# Analyze a directory
python scripts/code_quality_checker.py /path/to/code

# Analyze specific language
python scripts/code_quality_checker.py . --language python

# JSON output
python scripts/code_quality_checker.py /path/to/code --json
```

**What it detects:**
- Long functions (>50 lines)
- Large files (>500 lines)
- God classes (>20 methods)
- Deep nesting (>4 levels)
- Too many parameters (>5)
- High cyclomatic complexity
- Missing error handling
- Unused imports
- Magic numbers

**Thresholds:**

| Issue | Threshold |
|-------|-----------|
| Long function | >50 lines |
| Large file | >500 lines |
| God class | >20 methods |
| Too many params | >5 |
| Deep nesting | >4 levels |
| High complexity | >10 branches |

---

### Review Report Generator

Combines PR analysis and code quality findings into structured review reports.

```bash
# Generate report for current repo
python scripts/review_report_generator.py /path/to/repo

# Markdown output
python scripts/review_report_generator.py . --format markdown --output review.md

# Use pre-computed analyses
python scripts/review_report_generator.py . \
  --pr-analysis pr_results.json \
  --quality-analysis quality_results.json
```

**Report includes:**
- Review verdict (approve, request changes, block)
- Score (0-100)
- Prioritized action items
- Issue summary by severity
- Suggested review order

**Verdicts:**

| Score | Verdict |
|-------|---------|
| 90+ with no high issues | Approve |
| 75+ with ≤2 high issues | Approve with suggestions |
| 50-74 | Request changes |
| <50 or critical issues | Block |

---

## Large Change Overview Format

When a commit or PR touches **≥5 files** or **≥100 total lines changed**, output a categorized diff overview instead of a flat file list. This format groups related files into semantic categories, surfaces the key logic changes per category, and makes the diff scannable without reading every hunk.

### Output structure

**1. Stats bar** — total files, `+insertions`, `−deletions` across the whole commit.

**2. Category summary table** — one row per semantic grouping, always with these four columns:

| Category | Files | What changed | Lines |
|----------|-------|--------------|-------|
| `<badge label>` | primary file(s), secondary count | one-sentence description of the intent | `+N −M` |

Rules for the Lines column:
- Sum `git diff --numstat` values for all files in the category.
- Show `+N` in green and `−M` in red; omit `−0`.
- Use `font-variant-numeric: tabular-nums` when rendered in HTML.

**3. Per-category diff cards** — for each category, show only the highest-signal hunks:
- The key before/after lines that explain *why* the change was made (not every modified line).
- Annotate with inline comments where the intent would not be obvious from the diff alone.
- Skip mechanical changes (import reorders, whitespace) unless they are the point.

### Trigger threshold

| Condition | Action |
|-----------|--------|
| < 5 files AND < 100 lines | Flat file list with inline stat is sufficient |
| ≥ 5 files OR ≥ 100 lines | Use category table + diff cards |
| ≥ 10 files OR ≥ 300 lines | Add rendered artifact (HTML diff overview) |

### Category badge vocabulary

Use consistent labels so the reader builds a mental model across sessions:

| Badge | Stripe color | When to use |
|-------|-------------|-------------|
| `Security` | amber | Auth, secrets, rate limiting, input validation |
| `AI` | green | LLM client, prompt construction, streaming |
| `Route` | blue | API route handlers (`app/api/**`) |
| `Config` | purple | env files, package.json, next.config.js, zappa_settings |
| `Schema` | teal | Prisma migrations, model changes |
| `UI` | pink | React components, pages, styles |
| `Infra` | red | Dockerfile, CDK, CI/CD workflows |
| `Pre-existing` | grey | Files on branch but not changed in this commit |

---

## Reference Guides

### Code Review Checklist
`references/code_review_checklist.md`

Systematic checklists covering:
- Pre-review checks (build, tests, PR hygiene)
- Correctness (logic, data handling, error handling)
- Security (input validation, injection prevention)
- Performance (efficiency, caching, scalability)
- Maintainability (code quality, naming, structure)
- Testing (coverage, quality, mocking)
- Language-specific checks

### Coding Standards
`references/coding_standards.md`

Language-specific standards for:
- TypeScript (type annotations, null safety, async/await)
- JavaScript (declarations, patterns, modules)
- Python (type hints, exceptions, class design)
- Go (error handling, structs, concurrency)
- Swift (optionals, protocols, errors)
- Kotlin (null safety, data classes, coroutines)

### Common Antipatterns
`references/common_antipatterns.md`

Antipattern catalog with examples and fixes:
- Structural (god class, long method, deep nesting)
- Logic (boolean blindness, stringly typed code)
- Security (SQL injection, hardcoded credentials)
- Performance (N+1 queries, unbounded collections)
- Testing (duplication, testing implementation)
- Async (floating promises, callback hell)

---

## Languages Supported

| Language | Extensions |
|----------|------------|
| Python | `.py` |
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs` |
| Go | `.go` |
| Swift | `.swift` |
| Kotlin | `.kt`, `.kts` |
