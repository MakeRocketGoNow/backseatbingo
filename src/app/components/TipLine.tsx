/**
 * One line on the winner screen, web only. The link comes from `VITE_TIP_URL`
 * at build time so the public repo never carries it; an empty value hides the
 * line, which is how the iOS build drops it.
 */
const TIP_URL = import.meta.env.VITE_TIP_URL?.trim() ?? '';

export function TipLine() {
  if (!TIP_URL) return null;
  return (
    <p className="tip-line">
      Free for every family. If it made the miles go faster,{' '}
      <a href={TIP_URL} target="_blank" rel="noopener noreferrer">
        leave a tip
      </a>
      .
    </p>
  );
}
