import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@/config/config.type';
import helmet from 'helmet';
import {
  HttpStatus,
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import setupSwagger from '@/utils/setup-swagger';
import { GlobalExceptionFilter } from '@/filters/global-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import { AuthService } from './api/auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const configService = app.get(ConfigService<AllConfigType>);
  const reflector = app.get(Reflector);

  // app.setGlobalPrefix(configService.get('app.apiPrefix', { infer: true }));

  app.useGlobalFilters(new GlobalExceptionFilter(configService));

  app.useGlobalGuards(new AuthGuard(reflector, app.get(AuthService)));
  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors: ValidationError[]) => {
        return new UnprocessableEntityException(errors);
      },
    }),
  );

  //
  app.enableVersioning({
    type: VersioningType.URI,
  });

  setupSwagger(app);

  await app.listen(configService.get('app.port', { infer: true }));

  console.info(`Server is running on: ${await app.getUrl()}`);
}
bootstrap();
