import { validationFailed } from '../../../application/errors';

/**
 * Document parsing for admin ingestion. PDFs use their text layer; scanned
 * PDFs (no text layer) require OCR, which is config-gated and optional.
 */
export async function parseDocument(
  content: Buffer,
  filename: string,
  mimeType: string | undefined,
  ocrEnabled: boolean,
): Promise<string> {
  const name = filename.toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();

  if (
    name.endsWith('.md') ||
    name.endsWith('.txt') ||
    mime.startsWith('text/plain')
  ) {
    return content.toString('utf8');
  }
  if (name.endsWith('.csv') || mime === 'text/csv') {
    const { parse } = await import('csv-parse/sync');
    const rows: string[][] = parse(content.toString('utf8'), {
      columns: false,
      skip_empty_lines: true,
    });
    return rows.map((row) => row.join(' | ')).join('\n');
  }
  if (name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html') {
    return stripHtml(content.toString('utf8'));
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: content });
    return result.value;
  }
  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default as (
      data: Buffer,
    ) => Promise<{ text: string }>;
    const result = await pdfParse(content);
    if (!result.text.trim() && ocrEnabled) {
      return ocrPdf();
    }
    if (!result.text.trim()) {
      throw validationFailed(
        'This PDF has no extractable text layer. Enable OCR_ENABLED and re-upload a scanned document.',
      );
    }
    return result.text;
  }

  throw validationFailed(
    `Unsupported file type "${filename}". Accepted: .md, .txt, .pdf, .docx, .html, .csv.`,
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function ocrPdf(): Promise<string> {
  // tesseract.js is an optional dependency (~30 MB); it is intentionally not
  // installed by default. Operators who enable OCR_ENABLED must add it.
  return Promise.reject(
    validationFailed(
      'OCR is enabled but the tesseract.js adapter is not installed on this deployment.',
    ),
  );
}
