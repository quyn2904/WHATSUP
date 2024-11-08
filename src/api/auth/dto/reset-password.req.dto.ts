import { PasswordField, StringField } from '@/decorators/field.decorators';

export class ResetPasswordReqDto {
  @PasswordField()
  password!: string;

  @StringField()
  token!: string;
}
