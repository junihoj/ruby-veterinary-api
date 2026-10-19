import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * intake.form_submission_alerts persistence — routing state for arrived
 * forms (care-coordination.md: alert rows are written after the submission
 * commits; an alert failure never fails the owner's request).
 */
@Injectable()
export class FormSubmissionAlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    sourceType: 'appointment_request' | 'intake_submission';
    sourceId: string;
    channel: 'admin_dashboard' | 'email' | 'whatsapp';
    destination: string | null;
  }) {
    return this.prisma.formSubmissionAlert.create({ data: input });
  }

  async markDelivered(id: string): Promise<void> {
    await this.prisma.formSubmissionAlert.update({
      where: { id },
      data: { status: 'delivered', attempts: 1, deliveredAt: new Date() },
    });
  }

  async markFailed(id: string, lastError: string): Promise<void> {
    await this.prisma.formSubmissionAlert.update({
      where: { id },
      data: { status: 'failed', attempts: 1, lastError },
    });
  }
}
