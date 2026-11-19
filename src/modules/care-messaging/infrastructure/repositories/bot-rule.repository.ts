import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class BotRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listKeywords(kind: string): Promise<string[]> {
    const rows = await this.prisma.botRule.findMany({
      where: { kind, active: true },
      select: { keywords: true },
      orderBy: { priority: 'desc' },
    });
    return rows.flatMap((row) => row.keywords.map((k) => k.toLowerCase()));
  }
}
