import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController, DepartmentsController], providers: [UsersService] })
export class UsersModule {}
