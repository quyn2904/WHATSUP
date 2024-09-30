import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { ValidationException } from '@/exceptions/validation.exception';
import { ErrorCode } from '@/constants/error-code.constant';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@/config/config.type';
import { plainToInstance } from 'class-transformer';
import { Queue } from 'bullmq';
import {
  IEmailJob,
  IPasswordResetJob,
  IVerifyEmailJob,
} from '@/common/interfaces/job.interface';
import { JobName, QueueName } from '@/constants/job.constant';
import { InjectQueue } from '@nestjs/bullmq';
import { hashPassword, verifyPassword } from '@/utils/password.util';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import ms from 'ms';
import crypto from 'crypto';
import { createCacheKey } from '@/utils/cache.util';
import { CacheKey } from '@/constants/cache.constant';
import {
  ForgotPasswordReqDto,
  ForgotPasswordResDto,
  LoginReqDto,
  LoginResDto,
  RefreshReqDto,
  RefreshResDto,
  RegisterReqDto,
  RegisterResDto,
} from './dto';
import { Branded } from '@/common/types/types';
import { SYSTEM_USER_ID } from '@/constants/app.constant';
import { JwtPayloadType } from './types/jwt-payload.type';
import { JwtRefreshPayloadType } from './types/jwt-refresh-payload.type';
type Token = Branded<
  {
    accessToken: string;
    refreshToken: string;
    tokenExpires: number;
  },
  'token'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    @InjectQueue(QueueName.EMAIL)
    private readonly emailQueue: Queue<IEmailJob, any, string>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async signIn(loginReqDto: LoginReqDto): Promise<LoginResDto> {
    const { email, password } = loginReqDto;
    const user = await this.prismaService.users.findFirst({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    const isPasswordValid =
      user && (await verifyPassword(password, user.password));

    if (!isPasswordValid) {
      throw new UnauthorizedException();
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const session = await this.prismaService.sessions.create({
      data: {
        hash,
        user_id: user.id,
        created_by: SYSTEM_USER_ID,
        updated_by: SYSTEM_USER_ID,
      },
    });

    const token = await this.createToken({
      id: user.id,
      sessonId: session.id,
      hash,
    });

    return plainToInstance(LoginResDto, {
      userId: user.id,
      ...token,
    });
  }

  async register(registerReqDto: RegisterReqDto): Promise<RegisterResDto> {
    const { email, password, first_name, last_name } = registerReqDto;
    const user = await this.prismaService.users.findFirst({
      where: {
        email,
      },
    });

    if (user) {
      throw new ValidationException(ErrorCode.E003);
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await this.prismaService.users.create({
      data: {
        email,
        password: hashedPassword,
        first_name,
        last_name,
      },
    });

    const token = await this.createVerificationToken({ id: newUser.id });
    const tokenExpiresIn = this.configService.getOrThrow(
      'auth.confirmEmailExpires',
      { infer: true },
    );

    await this.cacheManager.set(
      createCacheKey(CacheKey.EMAIL_VERIFICATION, newUser.id),
      token,
      ms(tokenExpiresIn),
    );

    await this.emailQueue.add(
      JobName.EMAIL_VERIFICATION,
      {
        email,
        token,
      } as IVerifyEmailJob,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 6000,
        },
      },
    );

    return plainToInstance(RegisterResDto, {
      userId: newUser.id,
    });
  }

  async logout(userToken: JwtPayloadType): Promise<void> {
    await this.cacheManager.store.set<boolean>(
      createCacheKey(CacheKey.SESSION_BLACKLIST, userToken.sessionId),
      true,
      userToken.exp * 1000 - Date.now(),
    );
    await this.prismaService.sessions.delete({
      where: {
        id: userToken.sessionId,
      },
    });
  }

  async refreshToken(dto: RefreshReqDto): Promise<RefreshResDto> {
    const { sessionId, hash } = this.verifyRefreshToken(dto.refreshToken);
    const session = await this.prismaService.sessions.findFirst({
      where: {
        id: sessionId,
      },
    });

    if (!session || session.hash !== hash) {
      throw new UnauthorizedException();
    }

    const user = await this.prismaService.users.findFirstOrThrow({
      where: { id: session.user_id },
      select: {
        id: true,
      },
    });

    const newHash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    await this.prismaService.sessions.update({
      where: {
        id: sessionId,
      },
      data: {
        hash: newHash,
      },
    });

    return await this.createToken({
      id: user.id,
      sessonId: session.id,
      hash: newHash,
    });
  }

  async forgotPassword(
    dto: ForgotPasswordReqDto,
  ): Promise<ForgotPasswordResDto> {
    const user = await this.prismaService.users.findFirst({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      throw new ValidationException(ErrorCode.E003);
    }

    const token = await this.createForgotPasswordToken({ id: user.id });
    const tokenExpiresIn = this.configService.getOrThrow('auth.forgotExpires', {
      infer: true,
    });

    await this.cacheManager.set(
      createCacheKey(CacheKey.PASSWORD_RESET, user.id),
      token,
      ms(tokenExpiresIn),
    );

    await this.emailQueue.add(
      JobName.PASSWORD_RESET,
      {
        email: dto.email,
        token,
      } as IPasswordResetJob,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 6000,
        },
      },
    );

    return plainToInstance(ForgotPasswordResDto, {
      userId: user.id,
    });
  }

  private async createToken(data: {
    id: string;
    sessonId: string;
    hash: string;
  }): Promise<Token> {
    const tokenExpiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });

    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    const [accessToken, refreshToken] = await Promise.all([
      await this.jwtService.signAsync(
        {
          id: data.id,
          role: '',
          sessionId: data.sessonId,
        },
        {
          secret: this.configService.getOrThrow('auth.secret', { infer: true }),
          expiresIn: tokenExpiresIn,
        },
      ),
      await this.jwtService.signAsync(
        {
          sessionId: data.sessonId,
          hash: data.hash,
        },
        {
          secret: this.configService.getOrThrow('auth.refreshSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
            infer: true,
          }),
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenExpires,
    } as Token;
  }

  private async createVerificationToken(data: { id: string }): Promise<string> {
    return await this.jwtService.signAsync(
      {
        id: data.id,
      },
      {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
          infer: true,
        }),
      },
    );
  }

  private async createForgotPasswordToken(data: {
    id: string;
  }): Promise<string> {
    return await this.jwtService.signAsync(
      {
        id: data.id,
      },
      {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.forgotExpires', {
          infer: true,
        }),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<JwtPayloadType> {
    let payload: JwtPayloadType;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException();
    }

    const isSessionBlackListed = await this.cacheManager.get<boolean>(
      createCacheKey(CacheKey.SESSION_BLACKLIST, payload.sessionId),
    );

    if (isSessionBlackListed) {
      throw new UnauthorizedException();
    }

    return payload;
  }

  private verifyRefreshToken(token: string): JwtRefreshPayloadType {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException();
    }
  }
}
