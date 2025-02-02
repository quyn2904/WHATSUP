import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobService } from './cron-job.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CronJobService],
})
export class CronJobsModule {}
