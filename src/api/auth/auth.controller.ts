import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ApiAuth, ApiPublic } from '@/decorators/http.decorators';
import {
  ForgotPasswordReqDto,
  ForgotPasswordResDto,
  LoginReqDto,
  LoginResDto,
  RefreshReqDto,
  RefreshResDto,
  RegisterReqDto,
  RegisterResDto,
  ResetPasswordReqDto,
  ResetPasswordResDto,
  VerifyEmailResDto,
} from './dto';
import { JwtPayloadType } from './types/jwt-payload.type';
import { CurrentUser } from '@/decorators/current-user.decorator';

@ApiTags('auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiPublic()
  @Post('login')
  async signIn(@Body() loginDto: LoginReqDto): Promise<LoginResDto> {
    return await this.authService.signIn(loginDto);
  }

  @ApiPublic()
  @Post('register')
  async register(@Body() registerDto: RegisterReqDto): Promise<RegisterResDto> {
    return await this.authService.register(registerDto);
  }

  @ApiAuth({
    summary: 'Logout',
    errorResponses: [400, 401, 403, 500],
  })
  @Post('logout')
  async logout(@CurrentUser() userToken: JwtPayloadType): Promise<void> {
    await this.authService.logout(userToken);
  }

  @ApiPublic({
    type: RefreshResDto,
    summary: 'Refresh token',
  })
  @Post('refresh')
  async refresh(@Body() refreshDto: RefreshReqDto): Promise<RefreshResDto> {
    return await this.authService.refreshToken(refreshDto);
  }

  @ApiPublic()
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordReqDto,
  ): Promise<ForgotPasswordResDto> {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @ApiPublic()
  @Get('verify/forgot-password')
  async verifyForgotPassword(@Query('token') token: string) {
    return await this.authService.verifyForgotPassword(token);
  }

  @ApiPublic()
  @Post('reset-password')
  async resetPassword(
    @Body() resetPasswordReqDto: ResetPasswordReqDto,
  ): Promise<ResetPasswordResDto> {
    return await this.authService.resetPassword(resetPasswordReqDto);
  }

  @ApiPublic()
  @Get('verify/email')
  async verifyEmail(@Query('token') token: string): Promise<VerifyEmailResDto> {
    return await this.authService.verifyEmail(token);
  }

  @ApiPublic()
  @Post('verify/email/resend')
  async resendVerifyEmail() {
    return 'resend verify email';
  }
}
