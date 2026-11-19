import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EmbeddingBatch,
  EmbeddingPort,
} from '../../application/ports/embedding-port';
import { estimateTokens } from './openai-llm.adapter';

export const EMBEDDING_DIMENSIONS = 1536;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'may',
  'my',
  'of',
  'on',
  'or',
  'our',
  'should',
  'so',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/** Shared by the fallback embedding and the lexical reranker. */
export function fallbackTokens(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens
    .filter((token) => !STOPWORDS.has(token))
    .map(stem)
    .filter((token) => token.length > 1);
}

function stem(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/**
 * Deterministic, offline embedding used when OPENAI_API_KEY is absent
 * (dev + e2e). Hashed bag-of-words: identical text → cosine 1; shared
 * vocabulary → meaningful similarity. Production must use OpenAI.
 */
@Injectable()
export class FallbackEmbeddingAdapter extends EmbeddingPort {
  readonly lexicalFallback = true;

  embed(texts: string[]): Promise<EmbeddingBatch> {
    return Promise.resolve({
      vectors: texts.map((text) => this.vector(text)),
      tokens: texts.reduce((sum, text) => sum + estimateTokens(text), 0),
    });
  }

  private vector(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    for (const token of fallbackTokens(text)) {
      const digest = createHash('sha256').update(token).digest();
      const index = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
      const sign = digest[4] % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }
    const norm = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    return norm === 0 ? vector : vector.map((value) => value / norm);
  }
}
