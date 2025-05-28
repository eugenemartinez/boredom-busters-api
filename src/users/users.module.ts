import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { ActivitiesModule } from '../activities/activities.module.js'; // Import ActivitiesModule

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ActivitiesModule, // Add ActivitiesModule to imports
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // Typically, you export the service if other modules need to inject it directly. TypeOrmModule.forFeature is usually not re-exported unless specific scenarios.
})
export class UsersModule {}
