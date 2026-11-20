import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Audit, CurrentUser, Roles } from '../common/decorators';
import { AuthUser, Role, USER_MANAGERS } from '../common/types';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(...USER_MANAGERS)
  list(@Query('role') role?: Role, @Query('departmentId') departmentId?: string) {
    return this.users.list({ role: Object.values(Role).includes(role as Role) ? role : undefined, departmentId });
  }

  @Post()
  @Roles(...USER_MANAGERS)
  @Audit('USER_CREATE', 'User')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @Roles(...USER_MANAGERS)
  @Audit('USER_UPDATE', 'User')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }
}
