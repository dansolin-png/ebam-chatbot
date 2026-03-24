/**
 * Convert stored message text → safe HTML for rendering.
 * Handles:
 *  - Literal \n (backslash-n from JSON storage) → actual newline
 *  - \n\n (double newline) → paragraph break <p>
 *  - \n (single newline) → <br>
 *  - **bold** → <strong>
 *  - Raw HTML tags pass through as-is
 */
export function renderMessageHtml(text) {
  if (!text) return ''
  // Normalize literal \n sequences → real newlines
  let t = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  // Convert **bold**
  t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Split on double newlines → paragraphs, single newline → <br>
  return t
    .split(/\n\n+/)
    .map(para => `<p style="margin:0 0 8px 0">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
