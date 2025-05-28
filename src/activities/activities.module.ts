import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './entities/activity.entity.js';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Activity])],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService], // Ensure ActivitiesService is exported here
})
export class ActivitiesModule {}
