import { scanPii } from './pii-scanner';

describe('scanPii', () => {
  it('flags emails and international phone numbers', () => {
    const findings = scanPii(
      'Call +234 813 964 0640 or email care@ruby-veterinary.com.',
    );
    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['pii_email', 'pii_phone']),
    );
    const phone = findings.find((finding) => finding.rule === 'pii_phone');
    expect(phone?.excerpt.replace(/\D/g, '')).toBe('2348139640640');
  });

  it('does not treat ISO dates or short numbers as phone numbers', () => {
    expect(scanPii('Last Updated: 2026-11-06')).toEqual([]);
    expect(scanPii('Open 8 hours a day; version 1.2.3.')).toEqual([]);
  });

  it('flags private addresses, patient ids, and lab values', () => {
    const findings = scanPii(
      '14 Ruby Lane, pet_5f3a8ec9-dea1-4a7b-b0b6-46be28cc2ed9, creatinine 2.4 mg/dL',
    );
    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining([
        'pii_address',
        'pii_patient_id',
        'pii_lab_value',
      ]),
    );
  });
});
