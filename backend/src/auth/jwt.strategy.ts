import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
      algorithms: ['HS256'],
    });
  }

  /** Роль і підрозділ беремо з БД, а не з токена: зміна ролі діє одразу. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, departmentId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const { isActive: _a, ...rest } = user;
    return rest;
  }
}
