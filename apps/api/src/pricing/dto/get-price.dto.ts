import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CURRENCY_FORMAT_REGEX } from '../../domain/symbol.js';

export class GetPriceDto {
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
}
