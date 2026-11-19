import { fallbackTokens } from '../adapters/fallback-embedding.adapter';
import type { RetrievedContext } from './prompt-builder';

/**
 * Offline-only reranker. The hashed bag-of-words adapter cannot rank long
 * chunks by cosine alone, so we score the candidate's content-term coverage
 * of the question instead. Production embeddings skip this path entirely.
 */
export function lexicalRerank(
  question: string,
  candidates: RetrievedContext[],
): RetrievedContext[] {
  const queryTerms = [...new Set(fallbackTokens(question))];
  if (queryTerms.length === 0) return candidates;

  return candidates
    .map((candidate) => {
      const chunkTerms = [...new Set(fallbackTokens(candidate.content))];
      const matched = queryTerms.filter((term) =>
        chunkTerms.some((chunkTerm) => termsMatch(term, chunkTerm)),
      ).length;
      const coverage = matched / queryTerms.length;
      return {
        candidate,
        coverage,
        score:
          coverage === 0
            ? 0
            : coverage * 0.9 + Math.max(0, candidate.score) * 0.1,
      };
    })
    .sort(
      (left, right) =>
        right.coverage - left.coverage || right.score - left.score,
    )
    .map(({ candidate, score }) => ({ ...candidate, score }));
}

/**
 * Cheap morphological match for the offline path: "cancell" ↔ "cancellation",
 * "vaccin" ↔ "vaccination". Only applied to terms long enough to be meaningful.
 */
export function termsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  return left.startsWith(right) || right.startsWith(left);
}
