import { type AppConfig } from '../../../config/config.types';
import { FormAlertService } from './form-alert.service';
import { FormSubmissionAlertRepository } from '../infrastructure/repositories/form-submission-alert.repository';
import { EmailPort } from '../infrastructure/email/email.port';

function buildService(
  alerts: FormSubmissionAlertRepository,
  email: EmailPort,
): FormAlertService {
  return new FormAlertService(alerts, email, {
    formAlertEmail: 'frontdesk@example.com',
  } as AppConfig);
}

describe('FormAlertService', () => {
  it('writes both alert rows and delivers the email', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ id: 'alert-email' })
      .mockResolvedValueOnce({ id: 'alert-dashboard' });
    const send = jest.fn().mockResolvedValue(undefined);
    const markDelivered = jest.fn();
    const markFailed = jest.fn();
    const alerts = {
      create,
      markDelivered,
      markFailed,
    } as unknown as FormSubmissionAlertRepository;
    const email = { send } as unknown as EmailPort;
    const service = buildService(alerts, email);

    await service.raise({
      sourceType: 'appointment_request',
      sourceId: 'apt-1',
      subject: 'Appointment request: Biscuit (urgent)',
      body: 'Mabel …',
    });

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel: 'email',
        destination: 'frontdesk@example.com',
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        channel: 'admin_dashboard',
        destination: null,
      }),
    );
    expect(send).toHaveBeenCalledWith({
      to: 'frontdesk@example.com',
      subject: 'Appointment request: Biscuit (urgent)',
      text: 'Mabel …',
    });
    expect(markDelivered).toHaveBeenCalledWith('alert-email');
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marks the email row failed when delivery throws, and still resolves', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ id: 'alert-email' })
      .mockResolvedValueOnce({ id: 'alert-dashboard' });
    const send = jest.fn().mockRejectedValue(new Error('smtp down'));
    const markDelivered = jest.fn();
    const markFailed = jest.fn();
    const alerts = {
      create,
      markDelivered,
      markFailed,
    } as unknown as FormSubmissionAlertRepository;
    const email = { send } as unknown as EmailPort;
    const service = buildService(alerts, email);

    await expect(
      service.raise({
        sourceType: 'intake_submission',
        sourceId: 'int-1',
        subject: 's',
        body: 'b',
      }),
    ).resolves.toBeUndefined();

    expect(markFailed).toHaveBeenCalledWith('alert-email', 'smtp down');
    expect(markDelivered).not.toHaveBeenCalled();
  });

  it('swallows alert-row failures so the owner request never fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const send = jest.fn();
    const markDelivered = jest.fn();
    const markFailed = jest.fn();
    const alerts = {
      create,
      markDelivered,
      markFailed,
    } as unknown as FormSubmissionAlertRepository;
    const email = { send } as unknown as EmailPort;
    const service = buildService(alerts, email);

    await expect(
      service.raise({
        sourceType: 'appointment_request',
        sourceId: 'apt-1',
        subject: 's',
        body: 'b',
      }),
    ).resolves.toBeUndefined();
  });
});
