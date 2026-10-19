'use client';

// Shown instead of a blank "Application error" page, with the actual message so it can be fixed.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="login">
      <div style={{ maxWidth: 460, textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p>The app hit an error. Send a screenshot of this message to whoever is fixing it.</p>
        <pre className="error" style={{ whiteSpace: 'pre-wrap' }}>{error.message}{error.digest ? `\n(${error.digest})` : ''}</pre>
        <button className="btn primary" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
