import { SetMetadata } from '@nestjs/common';

export type AppRole = 'student' | 'teacher' | 'admin';
export const ROLES_KEY = 'ROLES_KEY';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
