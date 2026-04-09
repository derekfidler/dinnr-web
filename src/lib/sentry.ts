import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    integrations: [
      // Automatically instruments fetch/XHR for distributed tracing
      Sentry.browserTracingIntegration(),
    ],

    // Capture 10% of transactions for performance monitoring.
    // Raise this if you want more perf data; lower it to reduce quota usage.
    tracesSampleRate: 0.1,

    // Never attach user email/IP/username — GDPR safe.
    // We only set user.id (Supabase UUID) via setSentryUser() below.
    sendDefaultPii: false,

    // Don't send errors in development unless you're debugging Sentry itself.
    enabled: import.meta.env.PROD,

    // Surface errors in the browser console during development (useful when
    // enabled: false means they won't reach Sentry).
    debug: false,
  });
}

/** Attach the logged-in user's Supabase UUID to future events. No PII. */
export function setSentryUser(userId: string) {
  Sentry.setUser({ id: userId });
}

/** Clear the user context on logout. */
export function clearSentryUser() {
  Sentry.setUser(null);
}

export { Sentry };
