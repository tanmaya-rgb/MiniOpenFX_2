import { Decimal } from 'decimal.js';

/**
 * Every currency in this system (crypto and fiat alike) is stored with the
 * same fixed precision. Real institutional systems vary decimals per
 * currency (e.g. USD=2, BTC=8); fixing it at 8 for every currency is a
 * deliberate simplification documented as a trade-off in the README.
 */
export const MINOR_UNIT_DECIMALS = 8;
const MINOR_UNIT_SCALE = new Decimal(10).pow(MINOR_UNIT_DECIMALS);

export function toMinorUnits(amount: Decimal.Value): bigint {
  const scaled = new Decimal(amount).mul(MINOR_UNIT_SCALE);
  if (!scaled.isInteger()) {
    throw new Error(
      `Amount ${amount.toString()} has more precision than ${MINOR_UNIT_DECIMALS} decimals`,
    );
  }
  return BigInt(scaled.toFixed(0));
}

export function fromMinorUnits(minor: bigint): Decimal {
  return new Decimal(minor.toString()).div(MINOR_UNIT_SCALE);
}

/**
 * For amounts computed from a multiplication/division (e.g. base * price),
 * the raw result usually has more than MINOR_UNIT_DECIMALS of precision.
 * Round explicitly to the house's favor rather than letting toMinorUnits
 * throw: round UP what a client owes, round DOWN what a client receives.
 */
export function roundToMinorUnits(
  amount: Decimal.Value,
  rounding: Decimal.Rounding,
): bigint {
  return toMinorUnits(new Decimal(amount).toDecimalPlaces(MINOR_UNIT_DECIMALS, rounding));
}
