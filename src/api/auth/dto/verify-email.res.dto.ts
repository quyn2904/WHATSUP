import { StringField } from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class VerifyEmailResDto {
  @Expose()
  @StringField()
  userId!: string;
}
