import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import AppConfig from '@/config/app.config';
import AuthConfig from '@/api/auth/config/auth.config';
import DatabaseConfig from '@/database/config/database.config';
import MailConfig from '@/mail/config/mail.config';
import RedisConfig from '@/redis/config/redis.config';
import { PrismaModule } from '@/database/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { AllConfigType } from '@/config/config.type';
import { MailModule } from '@/mail/mail.module';
import { ApiModule } from '@/api/api.module';
import { BackgroundModule } from '@/background/background.module';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { FileModule } from './file/file.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [AppConfig, AuthConfig, DatabaseConfig, MailConfig, RedisConfig],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        connection: {
          host: configService.getOrThrow('redis.host', { infer: true }),
          port: configService.getOrThrow('redis.port', { infer: true }),
          password: configService.getOrThrow('redis.password', { infer: true }),
          tls: configService.get('redis.tlsEnabled', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AllConfigType>) => ({
        store: await redisStore({
          host: configService.getOrThrow('redis.host', { infer: true }),
          port: configService.getOrThrow('redis.port', { infer: true }),
          password: configService.getOrThrow('redis.password', { infer: true }),
          tls: configService.get('redis.tlsEnabled', { infer: true }),
        }),
      }),
      isGlobal: true,
      inject: [ConfigService],
    }),
    BackgroundModule,
    PrismaModule,
    MailModule,
    ApiModule,
    FileModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
