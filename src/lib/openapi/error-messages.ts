export function extractErrorMessages(
  // biome-ignore lint/suspicious/noExplicitAny: Zod v4 internal API for extracting check error messages
  zodDef: any
): Record<string, string> | null {
  const { checks } = zodDef;
  if (!(checks && Array.isArray(checks))) {
    return null;
  }

  const errorMessages: Record<string, string> = {};
  for (const check of checks) {
    const checkDef = check._zod?.def;
    if (!checkDef?.error || typeof checkDef.error !== "function") {
      continue;
    }
    try {
      const msg = checkDef.error({ input: "" });
      if (typeof msg === "string") {
        const key = checkDef.format
          ? `${checkDef.check}:${checkDef.format}`
          : checkDef.check;
        errorMessages[key] = msg;
      }
    } catch {
      // Skip checks that can't produce a message
    }
  }

  return Object.keys(errorMessages).length > 0 ? errorMessages : null;
}
