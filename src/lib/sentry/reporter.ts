import { captureException } from "@sentry/bun";

type CaptureContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export const ErrorReporter = {
  capture(error: unknown, context?: CaptureContext): string {
    return captureException(error, context);
  },
};
