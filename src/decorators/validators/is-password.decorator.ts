import { registerDecorator } from 'class-validator';

export function IsPassword(): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      propertyName: propertyName as string,
      name: 'isPassword',
      target: object.constructor,
      constraints: [],
      validator: {
        validate(value: string) {
          return /^[\d!#$%&*@A-Z^a-z]*$/.test(value);
        },
        defaultMessage() {
          return `$property is invalid`;
        },
      },
    });
  };
}
