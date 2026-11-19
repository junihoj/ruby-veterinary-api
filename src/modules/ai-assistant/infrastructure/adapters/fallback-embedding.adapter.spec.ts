import { fallbackTokens } from './fallback-embedding.adapter';

describe('fallbackTokens', () => {
  it('removes stopwords and folds plurals/verb endings', () => {
    expect(fallbackTokens('What are your cancellation policies?')).toEqual([
      'cancellation',
      'policy',
    ]);
    expect(fallbackTokens('Appointments may be cancelled')).toEqual([
      'appointment',
      'cancell',
    ]);
    expect(fallbackTokens('Vaccinations for puppies')).toEqual([
      'vaccination',
      'puppy',
    ]);
  });
});
