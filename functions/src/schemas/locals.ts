import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const jsonObject = z.record(z.any()).transform((v): Prisma.InputJsonValue => v);

export const createLocalSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => typeof v === 'string' ? parseInt(v, 10) : v),
  name: z.string().min(1),
  config: jsonObject,
});

export const updateLocalSchema = z.object({
  name: z.string().min(1).optional(),
  config: jsonObject.optional(),
});
