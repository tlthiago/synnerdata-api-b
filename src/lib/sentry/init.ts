import { init } from "@sentry/bun";
import { env, isProduction } from "@/env";

const dsn = env.SENTRY_DSN;

if (dsn) {
  init({
    dsn,
    environment: isProduction ? "production" : "preview",
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        const { authorization: _, cookie: __, ...safe } = event.request.headers;
        event.request.headers = safe;
      }
      return event;
    },
  });
}
