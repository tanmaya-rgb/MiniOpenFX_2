import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  @Min(0)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  SEEDED_API_KEY!: string;

  @IsInt()
  @Min(0)
  PRICE_CACHE_TTL_MS: number = 1500;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }

  return validated;
}
