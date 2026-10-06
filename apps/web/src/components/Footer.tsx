export const DISCLAIMER = "Korra prepares documents; you or your CA submit them. Not legal or tax advice.";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-muted">
      <p>{DISCLAIMER}</p>
    </footer>
  );
}
