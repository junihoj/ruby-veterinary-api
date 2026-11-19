/** LLM abstraction (ADR-0017): swap OpenAI for any provider without touching
 * the answer handler. Implementations stream tokens through `onToken` and
 * return the full text plus usage for the daily cap ledger. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export abstract class LlmPort {
  abstract complete(
    messages: LlmMessage[],
    onToken?: (token: string) => void,
  ): Promise<LlmCompletion>;
}
