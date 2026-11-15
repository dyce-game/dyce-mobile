import {
  CONTACT_BATCH_SIZE,
  chunk,
  contactsMatchSchema,
  friendRequestSchema,
  prepareContacts,
  type DeviceContact,
} from './schemas/contacts.ts';

const contact = (id: string, name: string, ...phones: string[]): DeviceContact => ({
  id,
  name,
  phones,
});

describe('prepareContacts', () => {
  it('normalises national and international formats to E.164', () => {
    const r = prepareContacts(
      [contact('1', 'Tunde', '0803 123 4567'), contact('2', 'Ada', '+234 805 000 1111')],
      'NG',
    );
    expect(r.numbers).toEqual(['+2348031234567', '+2348050001111']);
    expect(r.labels).toEqual(['Tunde', 'Ada']);
  });

  it('merges the same person saved twice or in different formats, keeping the first name', () => {
    const r = prepareContacts(
      [
        contact('1', 'Tunde', '0803 123 4567', '+2348031234567'),
        contact('2', 'Tunde (work)', '08031234567'),
      ],
      'NG',
    );
    expect(r.numbers).toEqual(['+2348031234567']);
    expect(r.labels).toEqual(['Tunde']);
  });

  it('drops junk, short codes and landline-looking garbage instead of failing', () => {
    const r = prepareContacts(
      [
        contact('1', 'Bank', '737', '*556#'),
        contact('2', 'Nobody', ''),
        contact('3', 'Ada', 'call me', '0805 000 1111'),
      ],
      'NG',
    );
    expect(r.numbers).toEqual(['+2348050001111']);
  });

  it('removes the user’s own number', () => {
    const r = prepareContacts(
      [contact('1', 'Me', '0803 123 4567'), contact('2', 'Ada', '0805 000 1111')],
      'NG',
      '+2348031234567',
    );
    expect(r.numbers).toEqual(['+2348050001111']);
  });

  it('numbers without a "+" need a default country; with one they do not', () => {
    expect(prepareContacts([contact('1', 'A', '08031234567')]).numbers).toEqual([]);
    expect(prepareContacts([contact('1', 'A', '+447911123456')]).numbers).toEqual([
      '+447911123456',
    ]);
  });

  it('handles an empty address book', () => {
    expect(prepareContacts([], 'NG')).toEqual({ numbers: [], labels: [] });
  });
});

describe('chunk', () => {
  it('splits into batches and keeps order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it('1,234 numbers become three batches of at most 500', () => {
    const batches = chunk(
      Array.from({ length: 1234 }, (_, i) => i),
      CONTACT_BATCH_SIZE,
    );
    expect(batches.map((b) => b.length)).toEqual([500, 500, 234]);
  });
  it('rejects a bad size', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe('contactsMatchSchema', () => {
  const numbers = (n: number) =>
    Array.from({ length: n }, (_, i) => `+23480312${String(10000 + i)}`);

  it('accepts 1 to 500 E.164 numbers', () => {
    expect(contactsMatchSchema.safeParse({ numbers: numbers(1) }).success).toBe(true);
    expect(contactsMatchSchema.safeParse({ numbers: numbers(500) }).success).toBe(true);
  });
  it('rejects empty, oversized and malformed input', () => {
    expect(contactsMatchSchema.safeParse({ numbers: [] }).success).toBe(false);
    expect(contactsMatchSchema.safeParse({ numbers: numbers(501) }).success).toBe(false);
    for (const bad of [
      '08031234567',
      '+0803123456',
      '+2348',
      'abc',
      '+234 803 123 4567',
      '+2348031234567890123',
    ]) {
      expect(contactsMatchSchema.safeParse({ numbers: [bad] }).success).toBe(false);
    }
    expect(contactsMatchSchema.safeParse({}).success).toBe(false);
  });
  it('validation errors never echo the submitted number', () => {
    const r = contactsMatchSchema.safeParse({ numbers: ['08031234567'] });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).not.toContain('8031234567');
  });
});

describe('friendRequestSchema', () => {
  it('needs a uuid', () => {
    expect(
      friendRequestSchema.safeParse({ userId: '3f2b8c0e-0b0a-4c43-9d7a-1f1f5a1c2b3d' }).success,
    ).toBe(true);
    expect(friendRequestSchema.safeParse({ userId: 'tunde' }).success).toBe(false);
  });
});
