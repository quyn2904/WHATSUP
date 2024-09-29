import {
  EmailField,
  PasswordField,
  StringField,
} from '@/decorators/field.decorators';

export class RegisterReqDto {
  @EmailField()
  email!: string;

  @PasswordField()
  password!: string;

  @StringField()
  first_name: string;

  @StringField()
  last_name: string;
}
