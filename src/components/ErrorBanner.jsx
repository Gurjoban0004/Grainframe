import { useEffect } from 'react';
import '../styles/ErrorBanner.css';

/**
 * ErrorBanner
 * @param {{ error: { message: string, recoverable: boolean } | null, onRetry: () => void, onDismiss: () => void }} props
 */
export default function ErrorBanner({ error, onRetry, onDismiss }) {
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, onDismiss]);

  return (
    <div
      className={`error-banner${error ? ' visible' : ''}`}
      aria-live="polite"
      role="alert"
    >
      {error && (
        <>
          <span className="error-banner__message">{error.message}</span>
          <div className="error-banner__actions">
            {error.recoverable && (
              <button
                className="error-banner__retry"
                onClick={onRetry}
                aria-label="Try again"
              >
                Try Again
              </button>
            )}
            <button
              className="error-banner__dismiss"
              onClick={onDismiss}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
