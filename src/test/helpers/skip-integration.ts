/**
 * Flag to skip integration tests that make real API calls (e.g., Pagarme).
 * Set SKIP_INTEGRATION_TESTS=true in CI to skip these tests.
 */
export const skipIntegration = process.env.SKIP_INTEGRATION_TESTS === "true";
