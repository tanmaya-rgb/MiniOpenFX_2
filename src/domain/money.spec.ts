import { fromMinorUnits, toMinorUnits } from './money.js';

describe('money', () => {
  it('converts a decimal amount to minor units', () => {
    expect(toMinorUnits('10000')).toBe(1_000_000_000_000n);
    expect(toMinorUnits('0.00000001')).toBe(1n);
  });

  it('converts minor units back to a decimal amount', () => {
    expect(fromMinorUnits(1_000_000_000_000n).toString()).toBe('10000');
    expect(fromMinorUnits(1n).toString()).toBe('1e-8');
  });

  it('rejects amounts with more precision than the minor unit scale', () => {
    expect(() => toMinorUnits('0.000000001')).toThrow();
  });
});
