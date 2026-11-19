import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  LlmCompletion,
  LlmMessage,
  LlmPort,
} from '../../application/ports/llm-port';
import { extractContextBlock } from '../retrieval/prompt-builder';
import { termsMatch } from '../retrieval/lexical-rerank';
import { fallbackTokens } from './fallback-embedding.adapter';
import { estimateTokens } from './openai-llm.adapter';

/**
 * Offline grounding model used when OPENAI_API_KEY is absent (dev + e2e).
 * It never invents content: it quotes the retrieved paragraph that best
 * matches the question, or returns the unsure fallback with the clinic phone.
 * Production uses OpenAI.
 */
@Injectable()
export class FallbackLlmAdapter extends LlmPort {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  complete(
    messages: LlmMessage[],
    onToken?: (token: string) => void,
  ): Promise<LlmCompletion> {
    const text = this.answer(messages);
    onToken?.(text);
    return Promise.resolve({
      text,
      promptTokens: messages.reduce(
        (sum, message) => sum + estimateTokens(message.content),
        0,
      ),
      completionTokens: estimateTokens(text),
    });
  }

  private answer(messages: LlmMessage[]): string {
    const context = extractContextBlock(messages);
    const question = extractQuestion(messages);
    const terms = new Set(fallbackTokens(question));

    let best: string | null = null;
    let bestScore = 0;
    for (const line of context.split('\n')) {
      const paragraph = cleanParagraph(line);
      if (!isUsable(paragraph)) continue;
      const overlap = fallbackTokens(paragraph).filter((term) =>
        [...terms].some((queryTerm) => termsMatch(term, queryTerm)),
      ).length;
      if (overlap === 0) continue;
      const score = overlap * 100 + Math.min(paragraph.length, 400);
      if (score > bestScore) {
        best = paragraph;
        bestScore = score;
      }
    }

    if (!best) {
      return `I'm not sure, please contact the clinic at ${this.config.clinic.phone}.`;
    }
    const excerpt = best.length > 700 ? `${best.slice(0, 697)}…` : best;
    return `According to our clinic information: ${excerpt}`;
  }
}

function extractQuestion(messages: LlmMessage[]): string {
  const user =
    [...messages].reverse().find((message) => message.role === 'user')
      ?.content ?? '';
  const index = user.lastIndexOf('Question:');
  return index >= 0 ? user.slice(index + 'Question:'.length).trim() : '';
}

function cleanParagraph(value: string): string {
  return value
    .replace(/^>\s?/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

function isUsable(value: string): boolean {
  return (
    value.length >= 40 &&
    !value.startsWith('#') &&
    !value.startsWith('|') &&
    !/^-{3,}$/.test(value)
  );
}
