import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { PageOptionsDto } from './page-options.dto';

export class CursorPaginationDto {
  @ApiProperty()
  @Expose()
  readonly limit: number;

  @ApiProperty()
  @Expose()
  readonly afterCursor?: number;

  @ApiProperty()
  @Expose()
  readonly beforeCursor?: number;

  @ApiProperty()
  @Expose()
  readonly totalRecords: number;

  constructor(
    totalRecords: number,
    afterCursor: number,
    beforeCursor: number,
    pageOptions: PageOptionsDto,
  ) {
    this.limit = pageOptions.limit;
    this.afterCursor = afterCursor;
    this.beforeCursor = beforeCursor;
    this.totalRecords = totalRecords;
  }
}
