/**
 * URL safety validation for web content.
 *
 * Extracted from webContent.ts per [LOC1a].
 */

/**
 * Validate URLs extracted from web content.
 * @param url - URL to validate
 * @returns Whether the URL is safe to use
 */
export function isUrlSafe(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const lowerUrl = url.toLowerCase().trim();

  const dangerousProtocols = [
    "javascript:",
    "data:",
    "vbscript:",
    "file:",
    "about:",
    "chrome:",
  ];

  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return false;
    }
  }

  // Check for encoded dangerous protocols
  if (lowerUrl.includes("%6a%61%76%61%73%63%72%69%70%74")) {
    // javascript
    return false;
  }

  // Allow only http, https, and relative URLs
  return (
    lowerUrl.startsWith("http://") ||
    lowerUrl.startsWith("https://") ||
    lowerUrl.startsWith("/") ||
    lowerUrl.startsWith("./") ||
    lowerUrl.startsWith("../")
  );
}
