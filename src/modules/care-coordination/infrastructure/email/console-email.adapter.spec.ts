import { ConsoleEmailAdapter } from './console-email.adapter';

describe('ConsoleEmailAdapter', () => {
  it('prints the message to stdout and resolves', async () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await expect(
      new ConsoleEmailAdapter().send({
        to: 'frontdesk@example.com',
        subject: 'Appointment request: Biscuit (urgent)',
        text: 'Mabel …',
      }),
    ).resolves.toBeUndefined();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain(
      '[email:console] To: frontdesk@example.com',
    );
    expect(write.mock.calls[0][0]).toContain(
      'Subject: Appointment request: Biscuit (urgent)',
    );
    write.mockRestore();
  });
});
