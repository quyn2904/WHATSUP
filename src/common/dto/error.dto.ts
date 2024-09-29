import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorDetailDto } from './error-detail.dto';

export class ErrorDto {
  @ApiProperty()
  timeStamp: string;

  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  error: string;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ type: ErrorDetailDto, isArray: true })
  details?: ErrorDetailDto[];

  stack?: string;

  trace?: Error | unknown;
}
