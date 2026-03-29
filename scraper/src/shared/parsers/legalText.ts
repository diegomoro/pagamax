/**
 * normalizeLegalText
 *
 * Cleans and normalizes raw legal/terms text for storage.
 * Reusable across all issuers.
 *
 * What it does:
 *   - Decodes common HTML entities (&nbsp;, &amp;, &lt;, &gt;, &quot;)
 *   - Collapses consecutive whitespace (spaces/tabs) to a single space
 *   - Normalizes line breaks (CRLF → LF, triple+ LF → double LF)
 *   - Trims leading/trailing whitespace
 *
 * What it does NOT do:
 *   - Does NOT strip content. Legal text must be preserved verbatim.
 *   - Does NOT interpret or summarize.
 *   - Does NOT remove disclaimers or asterisks.
 *
 * Returns the normalized string. Never throws.
 */
export function normalizeLegalText(raw: string): string {
  if (!raw) return '';

  return raw
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 10)),
    )
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Collapse inline whitespace (not newlines)
    .replace(/[ \t]{2,}/g, ' ')
    // Collapse excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing spaces on each line
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
