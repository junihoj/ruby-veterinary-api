/** Plain-text recursive-ish chunker: paragraph/sentence aware, ~800 chars
 * with 120-char overlap (data-model/ai-assistant.md). */
export function chunkText(
  text: string,
  maxChars = 800,
  overlap = 120,
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = '';

  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
  };

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      push(current);
      current = overlap > 0 ? current.slice(-overlap) : '';
    }
    if (paragraph.length <= maxChars) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    // Oversized paragraph: split on sentence boundaries.
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) push(current);
        current = overlap > 0 ? current.slice(-overlap) : '';
        current = current ? `${current} ${sentence}` : sentence;
        if (current.length > maxChars) {
          // Hard split for pathological runs.
          for (let i = 0; i < current.length; i += maxChars) {
            push(current.slice(i, i + maxChars));
          }
          current = '';
        }
      }
    }
  }
  if (current) push(current);
  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}
