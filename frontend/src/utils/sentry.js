import * as Sentry from '@sentry/react';

export const initSentry = () => {
  // Only initialize Sentry in production
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring in dev, lower in production
      // Session Replay
      replaysSessionSampleRate: 0.1, // 10% of sessions
      replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
      // Environment
      environment: import.meta.env.MODE,
      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || 'development',
      // Custom error filtering
      beforeSend(event, hint) {
        // Filter out development errors
        if (import.meta.env.DEV) {
          return null;
        }

        // Log error to console in development
        console.error('Sentry Error:', hint.originalException || hint.syntheticException);

        return event;
      },
    });
  }
};

export default Sentry;
