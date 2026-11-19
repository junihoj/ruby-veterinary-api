import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  EmbeddingBatch,
  EmbeddingPort,
} from '../../application/ports/embedding-port';
import { estimateTokens } from './openai-llm.adapter';

@Injectable()
export class OpenAiEmbeddingAdapter extends EmbeddingPort {
  private client: OpenAI | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  private requireClient(): OpenAI {
    if (!this.config.ai.openAiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured.');
    }
    this.client ??= new OpenAI({
      apiKey: this.config.ai.openAiApiKey,
      timeout: this.config.ai.llmTimeoutMs,
    });
    return this.client;
  }

  async embed(texts: string[]): Promise<EmbeddingBatch> {
    if (texts.length === 0) return { vectors: [], tokens: 0 };
    const response = await this.requireClient().embeddings.create({
      model: this.config.ai.embeddingModel,
      input: texts,
    });
    return {
      vectors: response.data.map((item) => item.embedding),
      tokens:
        response.usage?.total_tokens ??
        texts.reduce((sum, text) => sum + estimateTokens(text), 0),
    };
  }
}
