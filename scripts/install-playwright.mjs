/**
 * Install Playwright browser binaries (local dev only).
 *
 * CI workflows handle Playwright installation via explicit cached steps
 * in .github/workflows/, so this script exits early when CI=true.
 *
 * - macOS (local): installs only chromium — WebKit crashes during
 *   _RegisterApplication in headless terminal contexts.
 * - Linux (local): installs chromium + webkit.
 *
 * Override with PLAYWRIGHT_INCLUDE_WEBKIT=1 to force WebKit install.
 */
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const ciEnv = (process.env.CI ?? "").trim().toLowerCase();
const isCI = !!ciEnv && ciEnv !== "0" && ciEnv !== "false";

if (isCI) {
  // CI workflows manage Playwright installation with caching.
  // See .github/workflows/playwright.yml and deploy.yml.
  process.exit(0);
}

const isMac = platform() === "darwin";
const includeWebkitEnv = process.env.PLAYWRIGHT_INCLUDE_WEBKIT;
const forceWebkitInstall =
  includeWebkitEnv === "1" || includeWebkitEnv === "true";
const disableWebkitInstall =
  includeWebkitEnv === "0" || includeWebkitEnv === "false";

const args = ["playwright", "install", "--with-deps", "chromium"];

if (forceWebkitInstall || (!disableWebkitInstall && !isMac)) {
  args.push("webkit");
}

execFileSync("npx", args, { stdio: "inherit" });
