/**
 * Parse CORS origins from environment variable.
 * Supports multiple origins separated by commas.
 *
 * @example
 * parseOrigins("https://app.com,https://admin.com")
 * // Returns: ["https://app.com", "https://admin.com"]
 */
export function parseOrigins(origins: string): string[] {
  return origins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
