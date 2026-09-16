import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { POSITIVE_DECIMAL_REGEX } from '../../domain/money.js';
import { SYMBOL_FORMAT_REGEX } from '../../domain/symbol.js';
import { tradeSideValues, type TradeSide } from '../../db/schema.js';

const MAX_TTL_SECONDS = 300;

export class CreateQuoteDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(SYMBOL_FORMAT_REGEX, {
    message: 'symbol must be an alphanumeric pair like BTCUSDT',
  })
  symbol!: string;

  @IsIn(tradeSideValues)
  side!: TradeSide;

  @IsString()
  @Matches(POSITIVE_DECIMAL_REGEX, {
    message: 'baseAmount must be a positive decimal string like "0.5"',
  })
  baseAmount!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_TTL_SECONDS)
  ttlSeconds!: number;
}
