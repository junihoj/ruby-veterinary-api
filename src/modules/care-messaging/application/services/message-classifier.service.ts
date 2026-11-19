import { Injectable, OnModuleInit } from '@nestjs/common';
import { BotRuleRepository } from '../../infrastructure/repositories/bot-rule.repository';

export type MessageClassification = 'emergency' | 'private_data' | 'normal';

const EMERGENCY_PATTERNS: RegExp[] = [
  /\b(poison(ed|ing)?|toxic|chocolate|antifreeze|rat poison|rodenticide|xylitol|grapes?|raisins?|onions?)\b/i,
  /\b(seizure|seizing|convuls\w*)\b/i,
  /\b(can'?t breathe|difficulty breathing|not breathing|gasping|choking|blue (gums|tongue))\b/i,
  /\b(bloat|distended abdomen|swollen belly|gdv)\b/i,
  /\b(hit by (a )?(car|vehicle)|trauma|accident|collapsed|unconscious|bleeding heavily|hemorrhage|heat ?stroke|heatstroke|overheat\w*)\b/i,
  /\b(can'?t urinate|cannot urinate|blocked bladder|straining to urinate)\b/i,
  /\b(emergency|dying|dead)\b/i,
];

const PRIVATE_DATA_PATTERNS: RegExp[] = [
  /\b(my|our)\s+(pet'?s?|dog'?s?|cat'?s?)\s+(record|records|lab|labs|test|tests|result|results|x-?ray|x-?rays|diagnos\w*|medic\w*|prescri\w*|treatment)\b/i,
  /\b(when is|what time is|cancel|reschedule|confirm|change|move)\s+(my|our)\s+(appointment|booking)\b/i,
  /\b(my|our)\s+(appointment|booking)\s+(time|date|status|details)\b/i,
  /\b(my|our)\s+(invoice|invoices|bill|bills|order|orders|prescription|prescriptions|refill|refills)\b/i,
  /\b(access|view|see|check|look up)\s+(my|our)\s+(record|records|account)\b/i,
  /\b(pet|client|patient)\s+(id|record number|file number)\b/i,
];

/**
 * Deterministic safety classifier (ADR-0017): runs before retrieval, no LLM.
 * Panic keywords are seeded in `messaging.bot_rules`; built-in defaults keep
 * the safety net working even on a fresh database.
 */
@Injectable()
export class MessageClassifierService implements OnModuleInit {
  private panicKeywords: string[] = [];

  constructor(private readonly rules: BotRuleRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      const keywords = await this.rules.listKeywords('panic');
      this.panicKeywords = keywords.filter((keyword) => keyword.length > 2);
    } catch {
      this.panicKeywords = [];
    }
  }

  classify(text: string): MessageClassification {
    const lower = text.toLowerCase();
    if (
      this.panicKeywords.some((keyword) => lower.includes(keyword)) ||
      EMERGENCY_PATTERNS.some((pattern) => pattern.test(text))
    ) {
      return 'emergency';
    }
    if (PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(text))) {
      return 'private_data';
    }
    return 'normal';
  }
}
