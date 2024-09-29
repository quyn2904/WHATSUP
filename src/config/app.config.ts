import { registerAs } from '@nestjs/config';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { Environment } from '@/constants/app.constant';
import { AppConfig } from './app-config.type';
import validateConfig from '@/utils/validate-config';

class EnvironmentVariablesValidator {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment;

  @IsString()
  @IsOptional()
  APP_NAME: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  APP_URL: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  APP_PORT: number;

  @IsString()
  @IsOptional()
  API_PREFIX: string;

  @IsBoolean()
  @IsOptional()
  APP_DEBUG: boolean;
}

export default registerAs<AppConfig>('app', () => {
  console.info('Register AppConfig from environment variables');
  validateConfig(process.env, EnvironmentVariablesValidator);

  const port = process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : 8000;

  return {
    nodeEnv: process.env.NODE_ENV || Environment.Development,
    name: process.env.APP_NAME || 'app',
    url: process.env.APP_URL || `http://localhost:${port}`,
    port,
    apiPrefix: process.env.API_PREFIX || 'api',
    debug: process.env.APP_DEBUG === 'true',
  };
});
