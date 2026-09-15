import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { SYMBOL_FORMAT_REGEX } from '../../domain/symbol.js';

export class GetPriceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(SYMBOL_FORMAT_REGEX, {
    message: 'symbol must be an alphanumeric pair like BTCUSDT',
  })
  symbol!: string;
}
