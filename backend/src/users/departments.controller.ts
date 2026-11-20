import { Body, ConflictException, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Audit, Roles } from '../common/decorators';
import { ALL_ROLES, USER_MANAGERS } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentDto } from './dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_ROLES)
  list() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, anpItems: true } } },
    });
  }

  @Post()
  @Roles(...USER_MANAGERS)
  @Audit('DEPARTMENT_CREATE', 'Department')
  async create(@Body() dto: DepartmentDto) {
    try {
      return await this.prisma.department.create({ data: { name: dto.name } });
    } catch (e) {
      if ((e as any)?.code === 'P2002') throw new ConflictException('Підрозділ з такою назвою вже існує');
      throw e;
    }
  }

  @Patch(':id')
  @Roles(...USER_MANAGERS)
  @Audit('DEPARTMENT_UPDATE', 'Department')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DepartmentDto) {
    return this.prisma.department.update({ where: { id }, data: { name: dto.name } });
  }

  @Delete(':id')
  @Roles(...USER_MANAGERS)
  @Audit('DEPARTMENT_DELETE', 'Department')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const items = await this.prisma.aNPItem.count({ where: { departmentId: id } });
    if (items > 0) throw new ConflictException('Підрозділ має пункти АНП, видалення неможливе');
    await this.prisma.department.delete({ where: { id } });
    return { id };
  }
}
