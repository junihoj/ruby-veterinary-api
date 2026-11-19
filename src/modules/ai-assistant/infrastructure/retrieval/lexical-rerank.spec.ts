import { lexicalRerank, termsMatch } from './lexical-rerank';
import type { RetrievedContext } from './prompt-builder';

function candidate(
  title: string,
  content: string,
  score: number,
): RetrievedContext {
  return {
    title,
    content,
    category: 'policy',
    effectiveDate: '2026-11-06',
    score,
  };
}

describe('lexicalRerank', () => {
  it('promotes the chunk that covers the question terms over a higher cosine score', () => {
    const ranked = lexicalRerank('What is your cancellation policy?', [
      candidate(
        'Product Catalog',
        'Fulfilment options and shipping for your order.',
        0.35,
      ),
      candidate(
        'Company Policies',
        'Cancellation Policy. Appointments may be cancelled or rescheduled.',
        0.17,
      ),
    ]);

    expect(ranked[0].title).toBe('Company Policies');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('matches simple morphological variants for long terms', () => {
    expect(termsMatch('cancell', 'cancellation')).toBe(true);
    expect(termsMatch('vaccin', 'vaccination')).toBe(true);
    expect(termsMatch('cat', 'catalog')).toBe(false);
  });

  it('drops candidates with no content-term overlap', () => {
    const ranked = lexicalRerank('What vaccinations do puppies need?', [
      candidate('Company Policies', 'Shipping and delivery information.', 0.5),
      candidate(
        'Pet Care FAQs',
        'Vaccination schedule for puppies and adult dogs.',
        0.2,
      ),
    ]);

    expect(ranked[0].title).toBe('Pet Care FAQs');
    expect(ranked[1].score).toBe(0);
  });
});
