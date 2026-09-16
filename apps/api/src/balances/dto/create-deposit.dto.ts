import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { POSITIVE_DECIMAL_REGEX } from '../../domain/money.js';

export class CreateDepositDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'currency must be an alphanumeric code like USDT or BTC',
  })
  currency!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL_REGEX, {
    message: 'amount must be a positive decimal string like "100"',
  })
  amount!: string;
}
