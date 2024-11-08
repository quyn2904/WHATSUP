import { EmailField } from '@/decorators/field.decorators';

export class ResendVerificationEmailReqDto {
  @EmailField()
  email!: string;
}
