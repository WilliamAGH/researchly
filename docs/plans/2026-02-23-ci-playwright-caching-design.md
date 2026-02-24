# CI Playwright Caching & Single-Install Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

1. Playwright browsers + system deps installed twice per CI run (postinstall hook + explicit workflow step).
2. Zero caching: every run downloads ~200 MB browsers + ~200 MB apt packages from scratch.
3. CI installs all 3 browsers when only chromium is needed.
4. Jobs that don't need Playwright still run the postinstall hook.
5. Slow Azure apt mirrors cause flaky 20-minute timeouts.

## Decision

**Approach A: Skip postinstall in CI + cache + chromium-only.**

- Postinstall stays for local dev convenience; exits early when `CI=true`.
- CI workflows own Playwright installation via explicit steps with caching.
- Only chromium is installed in CI (eliminates ~150 MB of webkit/firefox system deps).

## Cache Strategy

```
Key:  playwright-browsers-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
Path: ~/.cache/ms-playwright
```

- Cache hit: run `npx playwright install-deps chromium` (apt only, fast).
- Cache miss: run `npx playwright install --with-deps chromium` (full download + apt).

## File Changes

| File                               | Change                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `scripts/install-playwright.mjs`   | Exit early when `CI=true`                                           |
| `.github/workflows/playwright.yml` | Add npm + Playwright cache, chromium-only, single install           |
| `.github/workflows/deploy.yml`     | Same for `preflight_playwright`; `--ignore-scripts` for non-PW jobs |
| `.github/workflows/validate.yml`   | `--ignore-scripts` for validate job                                 |

## Implementation Steps

1. Modify `scripts/install-playwright.mjs` to exit early in CI.
2. Update `playwright.yml`: add `cache: "npm"`, add `actions/cache@v5` for Playwright browsers, cache-aware install step, chromium-only.
3. Update `deploy.yml`: same Playwright caching for `preflight_playwright`, `--ignore-scripts` for `preflight_validate` and `deploy` jobs.
4. Update `validate.yml`: `--ignore-scripts` for `validate` job.
5. Verify: review all workflows for consistency.
