import { DEFAULT_PAGE_LIMIT } from '@/constants/app.constant';
import {
  NumberFieldOptional,
  StringFieldOptional,
} from '@/decorators/field.decorators';

export class PageOptionsDto {
  @StringFieldOptional()
  afterCursor?: string;

  @StringFieldOptional()
  beforeCursor?: string;

  @NumberFieldOptional()
  readonly limit?: number = DEFAULT_PAGE_LIMIT;

  @StringFieldOptional()
  readonly q?: string;
}
