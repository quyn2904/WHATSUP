import { ResetPasswordReqDto } from './dto/reset-password.req.dto';
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
  IPasswordChangedJob,
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
  ResendVerificationEmailReqDto,
  ResendVerificationEmailResDto,
  ResetPasswordResDto,
  VerifyEmailResDto,
  VerifyForgotPasswordResDto,
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

    if (!user) {
      throw new ValidationException(ErrorCode.E002);
    }

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

    await this.sendVerificationEmail(newUser.id, email);

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

    const maxAttempt = await this.configService.getOrThrow(
      'auth.forgotMaxAttempt',
      { infer: true },
    );

    const numberOfAttempt =
      (await this.cacheManager.get<number>(
        createCacheKey(CacheKey.PASSWORD_RESET_ATTEMPT, user.id),
      )) || 0;

    if (numberOfAttempt === maxAttempt) {
      throw new ValidationException(ErrorCode.E004);
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

    const maxAttemptExpiresIn = this.configService.getOrThrow(
      'auth.forgotMaxAttemptExpiresIn',
      { infer: true },
    );

    await this.cacheManager.set(
      createCacheKey(CacheKey.PASSWORD_RESET_ATTEMPT, user.id),
      numberOfAttempt + 1,
      ms(maxAttemptExpiresIn),
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

  async verifyForgotPassword(
    token: string,
  ): Promise<VerifyForgotPasswordResDto> {
    const payload = await this.verifyForgotPasswordToken(token);

    return plainToInstance(VerifyForgotPasswordResDto, {
      userId: payload.id,
    });
  }

  async resetPassword(
    requestPasswordReqDto: ResetPasswordReqDto,
  ): Promise<ResetPasswordResDto> {
    const { token, password } = requestPasswordReqDto;
    const payload = await this.verifyForgotPasswordToken(token);
    const hashedPassword = await hashPassword(password);

    const user = await this.prismaService.users.update({
      where: {
        id: payload.id,
      },
      data: {
        password: hashedPassword,
      },
    });

    await this.cacheManager.del(
      createCacheKey(CacheKey.PASSWORD_RESET, payload.id),
    );

    await this.emailQueue.add(
      JobName.PASSWORD_CHANGED,
      {
        email: user.email,
      } as IPasswordChangedJob,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 6000,
        },
      },
    );

    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<VerifyEmailResDto> {
    const payload = await this.verifyVerificationToken(token);
    const user = await this.prismaService.users.update({
      where: {
        id: payload.id,
      },
      data: {
        status: 'VERIFIED',
      },
    });

    await this.cacheManager.del(
      createCacheKey(CacheKey.EMAIL_VERIFICATION, user.id),
    );

    return plainToInstance(VerifyEmailResDto, {
      userId: user.id,
    });
  }

  async resendVerificationEmail(
    resendVerificationEmailReqDto: ResendVerificationEmailReqDto,
  ): Promise<ResendVerificationEmailResDto> {
    const { email } = resendVerificationEmailReqDto;

    const user = await this.prismaService.users.findFirst({
      where: {
        email,
      },
    });

    if (!user) {
      throw new ValidationException(ErrorCode.E003);
    }

    if (user.status === 'VERIFIED') {
      throw new ValidationException(ErrorCode.E005);
    }

    await this.sendVerificationEmail(user.id, email);

    return plainToInstance(ResendVerificationEmailResDto, {
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

  private async verifyForgotPasswordToken(
    token: string,
  ): Promise<JwtPayloadType> {
    let payload: JwtPayloadType;

    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException();
    }

    const latestToken = await this.cacheManager.get<string>(
      createCacheKey(CacheKey.PASSWORD_RESET, payload.id),
    );

    if (!latestToken || latestToken !== token) {
      throw new UnauthorizedException();
    }

    return payload;
  }

  private async verifyVerificationToken(
    token: string,
  ): Promise<JwtPayloadType> {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException();
    }
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

  private async sendVerificationEmail(userId: string, email: string) {
    const token = await this.createVerificationToken({ id: userId });

    const tokenExpiresIn = this.configService.getOrThrow(
      'auth.confirmEmailExpires',
      { infer: true },
    );

    await this.cacheManager.set(
      createCacheKey(CacheKey.EMAIL_VERIFICATION, userId),
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
  }
}
