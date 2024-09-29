import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@/config/config.type';
import { join } from 'path';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async (config: ConfigService<AllConfigType>) => ({
        transport: {
          host: config.get('mail.host', { infer: true }),
          port: config.get('mail.port', { infer: true }),
          ignoreTLS: config.get('mail.ignoreTLS', { infer: true }),
          requireTLS: config.get('mail.requireTLS', { infer: true }),
          secure: config.get('mail.secure', { infer: true }),
          auth: {
            user: config.get('mail.user', { infer: true }),
            pass: config.get('mail.password', { infer: true }),
          },
        },
        defaults: {
          from: `"${config.get('mail.defaultName', { infer: true })}" <${config.get('mail.defaultEmail', { infer: true })}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
