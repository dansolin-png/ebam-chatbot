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
  // Already HTML — pass through directly
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  // Plain text: normalize literal \n, convert **bold**, split on \n\n
  let t = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  return t
    .split(/\n\n+/)
    .map(para => `<p style="margin:0 0 8px 0">${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
