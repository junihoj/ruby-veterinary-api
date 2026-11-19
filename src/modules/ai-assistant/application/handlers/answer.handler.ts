import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { EmbeddingPort } from '../ports/embedding-port';
import { LlmPort } from '../ports/llm-port';
import type {
  AnswerInput,
  AnswerResult,
  CitationDto,
} from '../ports/ai-assistant-port';
import { PgvectorRetriever } from '../../infrastructure/retrieval/pgvector-retriever';
import { lexicalRerank } from '../../infrastructure/retrieval/lexical-rerank';
import { buildMessages } from '../../infrastructure/retrieval/prompt-builder';

/** The offline lexical adapter matches content terms; require half of them. */
const FALLBACK_MIN_SCORE = 0.5;

@Injectable()
export class AnswerHandler {
  constructor(
    @Inject(EmbeddingPort) private readonly embeddings: EmbeddingPort,
    @Inject(LlmPort) private readonly llm: LlmPort,
    private readonly retriever: PgvectorRetriever,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(
    input: AnswerInput,
    onToken?: (token: string) => void,
  ): Promise<AnswerResult> {
    const phone = this.config.clinic.phone;
    const contact = this.config.clinic.contactUrl;

    try {
      const question = input.question.trim();
      if (!question) {
        return this.unsure(
          `Please type a question, or call the clinic at ${phone}.`,
          onToken,
        );
      }

      const { vectors } = await this.embeddings.embed([question]);
      const topK = input.topK ?? this.config.ai.ragTopK;
      const minScore =
        input.minScore ??
        (this.embeddings.lexicalFallback
          ? FALLBACK_MIN_SCORE
          : this.config.ai.ragMinScore);

      const candidates = await this.retriever.retrieve(
        vectors[0],
        this.embeddings.lexicalFallback ? Math.max(topK * 10, 50) : topK,
      );
      const ranked = this.embeddings.lexicalFallback
        ? lexicalRerank(question, candidates).slice(0, topK)
        : candidates;
      const strong = ranked.filter((item) => item.score >= minScore);

      if (strong.length === 0) {
        return this.unsure(
          `I'm not sure about that. Please call the clinic at ${phone} or contact us at ${contact}.`,
          onToken,
        );
      }

      const messages = buildMessages(
        strong,
        input.history ?? [],
        question,
        phone,
      );
      const completion = await this.llm.complete(messages, onToken);

      const citations: CitationDto[] = [];
      const seen = new Set<string>();
      for (const item of strong) {
        const key = `${item.title}|${item.category}`;
        if (seen.has(key)) continue;
        seen.add(key);
        citations.push({
          title: item.title,
          category: item.category,
          effectiveDate: item.effectiveDate,
        });
      }

      return {
        text: completion.text,
        citations,
        weakRetrieval: false,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
      };
    } catch {
      return this.unsure(
        `I'm not sure right now. Please call the clinic at ${phone} or contact us at ${contact}.`,
        onToken,
      );
    }
  }

  private unsure(
    text: string,
    onToken?: (token: string) => void,
  ): AnswerResult {
    onToken?.(text);
    return {
      text,
      citations: [],
      weakRetrieval: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }
}
