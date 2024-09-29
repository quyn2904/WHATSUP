import {
  DEFAULT_CURRENT_PAGE,
  DEFAULT_PAGE_LIMIT,
  Order,
} from '@/constants/app.constant';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from 'src/decorators/field.decorators';

export class PageOptionsDto {
  @NumberFieldOptional({
    minimum: 1,
    int: true,
    default: DEFAULT_PAGE_LIMIT,
  })
  readonly limit?: number = DEFAULT_PAGE_LIMIT;

  @NumberFieldOptional({
    minimum: 1,
    int: true,
    default: DEFAULT_CURRENT_PAGE,
  })
  readonly page?: number = DEFAULT_CURRENT_PAGE;

  @StringFieldOptional()
  readonly q?: string;

  @EnumFieldOptional(() => Order, { default: Order.ASC })
  readonly order?: Order = Order.ASC;

  get offset() {
    return this.page ? (this.page - 1) * this.limit : 0;
  }
}
