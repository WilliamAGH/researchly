# Convex Upgrade 1.25.4 → 1.32.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task.

**Goal:** Upgrade Convex SDK from 1.25.4 to 1.32.0, apply explicit-ids
codemod, and update the Convex skill file to match the new version.

**Architecture:** Bump three npm packages (convex, @convex-dev/auth,
convex-test), run the official codemod to rewrite 55 `ctx.db` call
sites, validate the build, then update the skill reference file.

**Tech Stack:** Convex 1.32.0, TypeScript, npm, @convex-dev/codemod

---

### Task 1: Bump Convex Dependencies

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json` (auto-generated)

**Step 1: Install latest versions**

Run:

```bash
npm install convex@latest @convex-dev/auth@latest
npm install -D convex-test@latest
```

Expected: `package.json` shows convex ^1.32.x, @convex-dev/auth updated,
convex-test updated. No npm ERR.

**Step 2: Verify installed versions**

Run:

```bash
npm list convex @convex-dev/auth convex-test
```

Expected: All three show updated versions. No `UNMET PEER DEPENDENCY`.

---

### Task 2: Run Explicit-IDs Codemod

**Files:**

- Modify: ~15 files under `convex/` (32 get + 18 patch + 5 delete = 55 sites)

**Step 1: Run the codemod**

Run:

```bash
npx @convex-dev/codemod@latest explicit-ids
```

Expected: Codemod reports ~55 rewrites across `convex/` files. All
`ctx.db.get(id)` become `ctx.db.get("table", id)`, etc.

**Step 2: Spot-check the rewrite**

Read `convex/messages.ts` (highest-impact file with 11 call sites) and
verify table names were correctly inferred. For example:

- `ctx.db.get(args.messageId)` → `ctx.db.get("messages", args.messageId)`
- `ctx.db.patch(msg._id, ...)` → `ctx.db.patch("messages", msg._id, ...)`

**Step 3: Verify no leftover old-style calls**

Run:

```bash
grep -rn 'ctx\.db\.\(get\|patch\|replace\|delete\)(' convex/ \
  | grep -v '_generated' \
  | grep -vP 'ctx\.db\.\w+\("[a-zA-Z]'
```

Expected: No output (all calls have a string table name as first arg).

---

### Task 3: Update .gitignore

**Files:**

- Modify: `.gitignore`

**Step 1: Add `.convex/` entry**

Add this line to `.gitignore` after the existing `node_modules` line:

```
.convex
```

Convex 1.32.0 stores local backend data in `.convex/` in the project
root instead of `~/.convex/`.

---

### Task 4: Build and Validate

**Step 1: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: 0 errors. If type errors appear in `_generated/` files, run
`npx convex dev --once` to regenerate (requires deployment connection).

**Step 2: Build**

Run:

```bash
npm run build
```

Expected: Clean build with 0 errors.

**Step 3: Lint**

Run:

```bash
npm run lint
```

Expected: 0 errors. The codemod may leave lines that trigger formatting
rules; fix any lint issues.

**Step 4: Run tests**

Run:

```bash
npm run test:all
```

Expected: All tests pass. `convex-test` compatibility with the new
`ctx.db` signatures is the main thing to watch.

---

### Task 5: Commit Dependency Upgrade

**Step 1: Stage and commit**

```bash
git add package.json package-lock.json .gitignore convex/
git commit -m "$(cat <<'EOF'
chore(deps): upgrade convex 1.25.4 → 1.32.0

Bump convex, @convex-dev/auth, and convex-test to latest.
Apply explicit-ids codemod: db.get/patch/delete now take table
name as first argument across 55 call sites.
Add .convex/ to .gitignore (1.32 local data storage).
EOF
)"
```

---

### Task 6: Update Convex Skill File — Version and DB API

**Files:**

- Modify: `~/.claude/skills/convex/SKILL.md`

**Step 1: Pin version in header**

Change line 8 from:

```
Convex backend TypeScript reference. Verified against docs.convex.dev.
```

To:

```
Convex backend TypeScript reference. Verified against convex@1.32.0 (docs.convex.dev).
```

**Step 2: Update Query Patterns section (lines ~129-142)**

Replace the old `db.get`/delete examples with explicit table names:

```typescript
// Indexed query (correct)
await ctx.db.query("messages")
  .withIndex("by_channelId", (q) => q.eq("channelId", channelId))
  .order("desc").take(10);

// Single doc
await ctx.db.get("messages", docId);

// Deletion: collect then delete
const docs = await ctx.db.query("table").withIndex(...).collect();
for (const doc of docs) { await ctx.db.delete("table", doc._id); }
```

**Step 3: Update Mutations section (lines ~146-151)**

```typescript
await ctx.db.insert("tasks", { name: "Buy milk", done: false });
await ctx.db.patch("tasks", taskId, { done: true }); // Shallow merge
await ctx.db.replace("tasks", taskId, { name: "Updated" }); // Full replace
await ctx.db.delete("tasks", taskId);
```

---

### Task 7: Update Convex Skill File — New Validators

**Files:**

- Modify: `~/.claude/skills/convex/SKILL.md`

**Step 1: Add missing validators to Common Validators table (line ~91)**

Add these rows to the table:

| Type    | Validator                | Notes                  |
| ------- | ------------------------ | ---------------------- |
| Float64 | `v.float64()`            | Alias for `v.number()` |
| Bytes   | `v.bytes()`              | ArrayBuffer            |
| Record  | `v.record(keys, values)` | Dynamic keys; max 1024 |

**Step 2: Add Validator Composition section after Common Validators**

Add new section:

````markdown
## Validator Composition (v1.29+)

`v.object()` validators support composition methods:

```typescript
const userValidator = v.object({
  name: v.string(),
  email: v.string(),
  role: v.string(),
});

userValidator.pick("name", "email"); // { name, email }
userValidator.omit("role"); // { name, email }
userValidator.partial(); // all fields optional
userValidator.extend({ age: v.number() }); // add fields
```
````

Use `paginationResultValidator(itemValidator)` from `"convex/server"` to
validate paginated query return values.

````

---

### Task 8: Update Convex Skill File — New Utilities and Features

**Files:**
- Modify: `~/.claude/skills/convex/SKILL.md`

**Step 1: Add Pagination Options to Query Patterns**

After the existing query examples, add:

```markdown
### Pagination Options (v1.32+)

```typescript
const results = await ctx.db.query("messages")
  .withIndex("by_channelId", (q) => q.eq("channelId", channelId))
  .paginate({ cursor, numItems: 25, maximumRowsRead: 1000, maximumBytesRead: 1_000_000 });
````

````

**Step 2: Add Value Size Utilities**

Add to the end of the Common Validators section or as a new small section:

```markdown
## Value Utilities (v1.31.7+)

```typescript
import { getConvexSize, getDocumentSize } from "convex/values";

const bytes = getConvexSize(value);     // Size of any Convex value in bytes
const docBytes = getDocumentSize(doc);  // Size of a document including system fields
````

````

---

### Task 9: Update Anti-Patterns Table

**Files:**
- Modify: `~/.claude/skills/convex/SKILL.md`

**Step 1: Add explicit-ids anti-pattern**

Add this row to the Anti-Patterns table (after BLK-CVX11):

| Code | Issue | Fix |
|------|-------|-----|
| WRN-CVX4 | `db.get(id)` without table name | Use `db.get("table", id)` (required in future) |

---

### Task 10: Validate Skill File and Commit

**Step 1: Check skill file line count**

The skill file must stay readable. Count lines and verify it's under
350 (per [LOC1a]).

**Step 2: Verify skill file renders correctly**

Read through `~/.claude/skills/convex/SKILL.md` end-to-end and check
for formatting issues, broken tables, or inconsistencies.

**Step 3: Commit skill update**

```bash
cd ~/.claude/skills/convex
git add SKILL.md
git commit -m "$(cat <<'EOF'
docs(skill): update convex skill for v1.32.0

Pin version to 1.32.0. Update db API examples to explicit-ids
syntax. Add v.record/bytes/float64, validator composition methods,
pagination options, value size utilities. Add WRN-CVX4 anti-pattern.
EOF
)"
````

Note: The skill file lives in `~/.claude/skills/convex/`, which may
not be a git repo. If so, skip the commit step — the file edit is
sufficient.
