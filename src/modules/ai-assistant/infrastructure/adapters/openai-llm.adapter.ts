import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  LlmCompletion,
  LlmMessage,
  LlmPort,
} from '../../application/ports/llm-port';

/** OpenAI chat-completions adapter (ADR-0017). Streams deltas to the caller and
 * reports usage for the daily token cap. */
@Injectable()
export class OpenAiLlmAdapter extends LlmPort {
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

  async complete(
    messages: LlmMessage[],
    onToken?: (token: string) => void,
  ): Promise<LlmCompletion> {
    const stream = await this.requireClient().chat.completions.create({
      model: this.config.ai.chatModel,
      messages,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    });

    let text = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        onToken?.(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    if (!completionTokens) completionTokens = estimateTokens(text);
    if (!promptTokens) {
      promptTokens = messages.reduce(
        (sum, message) => sum + estimateTokens(message.content),
        0,
      );
    }
    return { text, promptTokens, completionTokens };
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
