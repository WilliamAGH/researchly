/**
 * Shared browser inclusion flags for Playwright configs.
 *
 * CI installs chromium only (to keep workflows fast). Firefox and WebKit
 * are opt-in everywhere via PLAYWRIGHT_INCLUDE_FIREFOX=1 / PLAYWRIGHT_INCLUDE_WEBKIT=1.
 *
 * Local Linux still gets WebKit by default (the install script handles it).
 * Local macOS skips WebKit — it crashes during _RegisterApplication (SIGABRT)
 * in headless terminal contexts.
 */

const ciEnv = process.env.CI?.trim().toLowerCase();
const isCI = !!ciEnv && ciEnv !== "0" && ciEnv !== "false";

const includeWebkitEnv = process.env.PLAYWRIGHT_INCLUDE_WEBKIT;
const includeWebkitForced =
  includeWebkitEnv === "1" || includeWebkitEnv === "true";
const includeWebkitDisabled =
  includeWebkitEnv === "0" || includeWebkitEnv === "false";

export const includeWebkit =
  includeWebkitForced ||
  (!includeWebkitDisabled && !isCI && process.platform !== "darwin");

const includeFirefoxEnv = process.env.PLAYWRIGHT_INCLUDE_FIREFOX;

export const includeFirefox =
  includeFirefoxEnv === "1" || includeFirefoxEnv === "true";
