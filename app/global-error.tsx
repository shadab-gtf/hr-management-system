"use client";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{ margin: "3rem", fontFamily: "system-ui", lineHeight: 1.6 }}
      >
        <main>
          <h1>We couldn’t open this workspace</h1>
          <p>Try again. No information has been changed.</p>
          <button
            onClick={reset}
            style={{ padding: "0.75rem 1.5rem", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
