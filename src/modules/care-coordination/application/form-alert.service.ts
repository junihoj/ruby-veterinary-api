import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/config.types';
import { FormSubmissionAlertRepository } from '../infrastructure/repositories/form-submission-alert.repository';
import { EmailPort } from '../infrastructure/email/email.port';

export type AlertSource = 'appointment_request' | 'intake_submission';

/**
 * Form alert routing (care-coordination.md invariants): every arrived form
 * records a dashboard + an email alert row and attempts delivery — and the
 * whole path is post-commit best effort. `raise` NEVER rejects: the owner's
 * 201 does not depend on alerts or mail (ADR-0013 console adapter until an
 * SMTP provider is chosen). The dashboard row stays queued until an
 * operations consumer claims it (M6).
 */
@Injectable()
export class FormAlertService {
  constructor(
    private readonly alerts: FormSubmissionAlertRepository,
    private readonly email: EmailPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async raise(input: {
    sourceType: AlertSource;
    sourceId: string;
    subject: string;
    body: string;
  }): Promise<void> {
    try {
      const emailAlert = await this.alerts.create({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        channel: 'email',
        destination: this.config.formAlertEmail,
      });
      await this.alerts.create({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        channel: 'admin_dashboard',
        destination: null,
      });

      try {
        await this.email.send({
          to: this.config.formAlertEmail,
          subject: input.subject,
          text: input.body,
        });
        await this.alerts.markDelivered(emailAlert.id);
      } catch (error) {
        await this.alerts.markFailed(
          emailAlert.id,
          error instanceof Error ? error.message : 'Unknown email failure.',
        );
      }
    } catch {
      // Alerts are telemetry, not the transaction — swallow everything so
      // a dashboard/email outage can never fail the owner's submission.
    }
  }
}
