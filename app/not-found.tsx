import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-state">
      <p className="eyebrow">404 · PAGE NOT FOUND</p>
      <h1>Nothing here just yet.</h1>
      <p>This page isn’t part of the current foundation preview.</p>
      <Link className="button button--primary" href="/">
        Back to foundation
      </Link>
    </main>
  );
}
