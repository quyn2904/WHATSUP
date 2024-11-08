import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronJobService {
  private readonly logger = new Logger(CronJobService.name);

  @Cron(CronExpression.EVERY_DAY_AT_10AM, {
    name: 'nofitications',
    // timeZone: 'Vietnam/Hanoi',
  })
  handleCron() {
    this.logger.debug('Called when the current second is 5');
  }
}
