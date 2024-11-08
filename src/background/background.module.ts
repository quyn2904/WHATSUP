import { Module } from '@nestjs/common';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { CronJobsModule } from './cron-jobs/cron-job.module';

@Module({
  imports: [EmailQueueModule, CronJobsModule],
})
export class BackgroundModule {}
