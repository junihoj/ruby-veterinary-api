import { AggregateRoot } from './aggregate-root';
import { Entity } from './entity';
import { PrefixedId } from './prefixed-id';
import { ValueObject } from './value-object';
import { err, ok, type Result } from './result';

class TestEntity extends Entity<{ name: string }> {
  constructor(id: string, name: string) {
    super(id, { name });
  }
}

class Money extends ValueObject<{ amount: number; currency: string }> {
  private constructor(props: { amount: number; currency: string }) {
    super(props);
  }

  static create(amount: number, currency: string): Money {
    return new Money({ amount, currency });
  }

  get amount(): number {
    return this.props.amount;
  }
}

class TestAggregate extends AggregateRoot {
  static create(id: string): TestAggregate {
    return new TestAggregate(id);
  }

  emit(event: unknown): void {
    this.addIntegrationEvent(event);
  }
}

function parsePositive(value: number): Result<number> {
  return value > 0 ? ok(value) : err('must be positive');
}

describe('shared/kernel', () => {
  describe('PrefixedId', () => {
    it('round-trips a UUID through its entity prefix', () => {
      const uuid = '9f2c1e3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
      const prefixed = PrefixedId.format('order', uuid);
      expect(prefixed).toBe(`ord_${uuid}`);
      expect(PrefixedId.toUuid(prefixed)).toBe(uuid);
    });

    it('generates a fresh id carrying the entity prefix', () => {
      const id = PrefixedId.newId('order');
      expect(id.startsWith('ord_')).toBe(true);
      expect(PrefixedId.isEntity(id, 'order')).toBe(true);
      expect(PrefixedId.isEntity(id, 'cart')).toBe(false);
    });

    it('rejects a malformed identifier on strict parse', () => {
      expect(() => PrefixedId.toUuid('ord_not-a-uuid')).toThrow();
    });

    it('returns null instead of throwing on lenient parse', () => {
      expect(PrefixedId.tryToUuid('nounderscore')).toBeNull();
      expect(PrefixedId.tryToUuid('ord_bogus')).toBeNull();
    });
  });

  describe('Entity', () => {
    it('exposes its id', () => {
      const entity = new TestEntity(PrefixedId.newId('pet'), 'Ruby');
      expect(entity.id).toMatch(/^pet_/);
    });

    it('considers two entities equal when ids match', () => {
      const id = PrefixedId.newId('pet');
      expect(new TestEntity(id, 'Ruby').equals(new TestEntity(id, 'Rex'))).toBe(
        true,
      );
    });

    it('considers different ids unequal', () => {
      const a = new TestEntity(PrefixedId.newId('pet'), 'Ruby');
      const b = new TestEntity(PrefixedId.newId('pet'), 'Ruby');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('ValueObject', () => {
    it('treats structurally equal values as equal across instances', () => {
      expect(Money.create(10, 'GBP').equals(Money.create(10, 'GBP'))).toBe(
        true,
      );
    });

    it('treats differing values as unequal', () => {
      expect(Money.create(10, 'GBP').equals(Money.create(11, 'GBP'))).toBe(
        false,
      );
    });

    it('is unequal against undefined', () => {
      expect(Money.create(10, 'GBP').equals(undefined)).toBe(false);
    });

    it('freezes its props against mutation', () => {
      const money = Money.create(10, 'GBP');
      expect(() => {
        (money as unknown as { props: { amount: number } }).props.amount = 99;
      }).toThrow();
      expect(money.amount).toBe(10);
    });
  });

  describe('Result', () => {
    it('unwraps a success', () => {
      expect(ok(5).unwrap()).toBe(5);
    });

    it('unwraps a failure by throwing the error', () => {
      expect(() => err('boom').unwrap()).toThrow('boom');
    });

    it('narrows via isOk/isErr', () => {
      expect(ok(1).isOk()).toBe(true);
      expect(ok(1).isErr()).toBe(false);
      expect(err('x').isOk()).toBe(false);
      expect(err('x').isErr()).toBe(true);
    });

    it('carries the error payload through parse', () => {
      const result = parsePositive(-1);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe('must be positive');
      }
    });
  });

  describe('AggregateRoot', () => {
    it('exposes its id', () => {
      const id = PrefixedId.newId('order');
      expect(TestAggregate.create(id).id).toBe(id);
    });

    it('buffers integration events until pulled', () => {
      const aggregate = TestAggregate.create(PrefixedId.newId('order'));
      aggregate.emit({ eventName: 'commerce.order.placed' });
      expect(aggregate['integrationEvents']).toHaveLength(1);
    });

    it('drains the buffer on pull so events publish exactly once', () => {
      const aggregate = TestAggregate.create(PrefixedId.newId('order'));
      aggregate.emit({ eventName: 'commerce.order.placed' });
      const pulled = aggregate.pullIntegrationEvents();
      expect(pulled).toHaveLength(1);
      expect(aggregate.pullIntegrationEvents()).toHaveLength(0);
    });
  });
});
