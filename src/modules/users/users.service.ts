import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly prisma = new PrismaService();

  // -----------------------------
  // CREATE USER
  // -----------------------------
  async create(dto: any) {
    this.logger.log(`Creating user: ${dto.email}`);

    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(`User ${dto.email} already exists`);
    }

    const hashed = await bcrypt.hash(dto.password || 'defaultpassword', 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
      },
    });

    const { password, ...safeUser } = user;

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: {
            include: { role: true },
          },
          member: true,
        },
      }),
      this.prisma.user.count({
        where: { deletedAt: null },
      }),
    ]);

    const users = data.map((user) => ({
      id: user.id.toString(),
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
      member: user.member
        ? {
            id: user.member.id.toString(),
            firstName: user.member.firstName,
            lastName: user.member.lastName,
          }
        : null,
      createdAt: user.createdAt,
    }));

    return {
      success: true,
      data: users,
      meta: { page, limit, total },
    };
  }

  // -----------------------------
  // GET ONE USER
  // -----------------------------
  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: toBigIntOptional(id), deletedAt: null },
      include: {
        roles: {
          include: { role: true },
        },
        member: true,
      },
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    const safeUser = {
      id: user.id.toString(),
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
      member: user.member
        ? {
            id: user.member.id.toString(),
            firstName: user.member.firstName,
            lastName: user.member.lastName,
          }
        : null,
      createdAt: user.createdAt,
    };

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE USER
  // -----------------------------
  async update(id: string, dto: any) {
    this.logger.log(`Updating user ${id}`);

    const user = await this.prisma.user.update({
      where: { id: toBigIntOptional(id), deletedAt: null },
      data: {
        email: dto.email,
      },
      include: {
        roles: {
          include: { role: true },
        },
        member: true,
      },
    });

    const safeUser = {
      id: user.id.toString(),
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
      member: user.member
        ? {
            id: user.member.id.toString(),
            firstName: user.member.firstName,
            lastName: user.member.lastName,
          }
        : null,
      createdAt: user.createdAt,
    };

    return {
      success: true,
      data: safeUser,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE USER (SOFT DELETE)
  // -----------------------------
  async remove(id: string) {
    this.logger.log(`Deleting user ${id}`);

    await this.prisma.user.update({
      where: { id: toBigIntOptional(id) },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // LINK USER → MEMBER
  // -----------------------------
  async linkMember(userId: string, memberId: string) {
    this.logger.log(`Linking user ${userId} to member ${memberId}`);

    const userIdBigInt = toBigIntOptional(userId);
    const memberIdBigInt = toBigIntOptional(memberId);

    // 1. Ensure user exists
    const user = await this.prisma.user.findFirst({
      where: { id: userIdBigInt, deletedAt: null },
      include: { member: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // 2. Ensure member exists
    const member = await this.prisma.member.findFirst({
      where: { id: memberIdBigInt, deletedAt: null },
    });

    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found`);
    }

    // 3. Prevent linking if member already has a user
    if (member.userId) {
      throw new ConflictException(
        `Member ${memberId} is already linked to a user`,
      );
    }

    // 4. If user already has a member → unlink first (optional but clean)
    if (user.member) {
      await this.prisma.member.update({
        where: { id: user.member.id },
        data: { userId: null },
      });
    }

    // 5. Link
    const updatedMember = await this.prisma.member.update({
      where: { id: memberIdBigInt },
      data: {
        userId: userIdBigInt,
      },
      include: {
        user: true,
      },
    });

    return {
      success: true,
      data: {
        memberId: updatedMember.id.toString(),
        userId: updatedMember.userId?.toString(),
      },
      meta: {},
    };
  }

  async unlinkMember(userId: string) {
    const userIdBigInt = toBigIntOptional(userId);

    const user = await this.prisma.user.findFirst({
      where: { id: userIdBigInt },
      include: { member: true },
    });

    if (!user || !user.member) {
      throw new NotFoundException('No member linked to this user');
    }

    await this.prisma.member.update({
      where: { id: user.member.id },
      data: { userId: null },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }
}
