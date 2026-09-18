import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches } from 'class-validator';
import { POSITIVE_DECIMAL_REGEX } from '../../domain/money.js';
import { CURRENCY_FORMAT_REGEX } from '../../domain/symbol.js';
import { tradeSideValues, type TradeSide } from '../../db/schema.js';

export class CreateQuoteDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(CURRENCY_FORMAT_REGEX, {
    message: 'baseCurrency must be an alphanumeric currency code like BTC',
  })
  baseCurrency!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(CURRENCY_FORMAT_REGEX, {
    message: 'quoteCurrency must be an alphanumeric currency code like USDT',
  })
  quoteCurrency!: string;

  @IsIn(tradeSideValues)
  side!: TradeSide;

  @IsString()
  @Matches(POSITIVE_DECIMAL_REGEX, {
    message: 'baseAmount must be a positive decimal string like "0.5"',
  })
  baseAmount!: string;
}
