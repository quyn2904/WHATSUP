import {
  IPasswordChangedJob,
  IPasswordResetJob,
  IVerifyEmailJob,
} from '@/common/interfaces/job.interface';
import { MailService } from '@/mail/mail.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(private readonly mailService: MailService) {}

  async sendEmailVerification(data: IVerifyEmailJob): Promise<void> {
    this.logger.debug(`Sending email verification to ${data.email}`);
    await this.mailService.sendEmailVerification(data.email, data.token);
  }

  async sendForgotPasswordToken(data: IPasswordResetJob): Promise<void> {
    this.logger.debug(`Sending forgot password token to ${data.email}`);
    await this.mailService.sendForgotPasswordToken(data.email, data.token);
  }

  async sendPasswordChanged(data: IPasswordChangedJob): Promise<void> {
    this.logger.debug(`Sending password changed email to ${data.email}`);
    await this.mailService.sendPasswordChanged(data.email);
  }
}
