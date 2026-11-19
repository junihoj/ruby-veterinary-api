/** Embedding abstraction (ADR-0017). Returns one 1536-dim vector per input
 * text plus the total token count reported by the provider. */
export interface EmbeddingBatch {
  vectors: number[][];
  tokens: number;
}

export abstract class EmbeddingPort {
  abstract embed(texts: string[]): Promise<EmbeddingBatch>;

  /**
   * The offline lexical adapter produces scores that are not comparable to
   * OpenAI embeddings, so retrieval reranks its candidates by content-term
   * coverage and applies a different threshold. Production adapters keep the
   * configured cosine threshold.
   */
  readonly lexicalFallback: boolean = false;
}
