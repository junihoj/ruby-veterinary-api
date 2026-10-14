import {
  signProviderPayload,
  verifyProviderSignature,
} from './provider-signature';

describe('commerce/provider-signature', () => {
  const secret = 'dev-payment-webhook-secret-change-me';
  const rawBody = Buffer.from(
    JSON.stringify({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { payment_ref: 'pi_mock_x' },
    }),
    'utf8',
  );

  it('accepts a correctly signed body', () => {
    const signature = signProviderPayload(rawBody, secret);
    expect(verifyProviderSignature(rawBody, signature, secret)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    expect(verifyProviderSignature(rawBody, 'deadbeef', secret)).toBe(false);
  });

  it('rejects a signature for a tampered body', () => {
    const signature = signProviderPayload(rawBody, secret);
    const tampered = Buffer.from(
      rawBody.toString('utf8').replace('evt_1', 'evt_2'),
      'utf8',
    );
    expect(verifyProviderSignature(tampered, signature, secret)).toBe(false);
  });

  it('rejects a signature under a different secret', () => {
    const signature = signProviderPayload(rawBody, 'other-secret');
    expect(verifyProviderSignature(rawBody, signature, secret)).toBe(false);
  });

  it('fails closed on missing inputs (unset secret = no silent accept)', () => {
    const signature = signProviderPayload(rawBody, secret);
    expect(verifyProviderSignature(rawBody, signature, undefined)).toBe(false);
    expect(verifyProviderSignature(rawBody, undefined, secret)).toBe(false);
    expect(verifyProviderSignature(undefined, signature, secret)).toBe(false);
    expect(verifyProviderSignature(Buffer.alloc(0), signature, secret)).toBe(
      false,
    );
  });

  it('rejects a prefixed header the provider did not sign verbatim', () => {
    // We document plain hex; "sha256=<hex>" is not the contract value.
    const signature = `sha256=${signProviderPayload(rawBody, secret)}`;
    expect(verifyProviderSignature(rawBody, signature, secret)).toBe(false);
  });
});
