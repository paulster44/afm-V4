import { z } from 'zod';

export const updateRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN', 'GOD']),
});

export const createAnnouncementSchema = z.object({
  message: z.string().min(1).max(2000),
});
