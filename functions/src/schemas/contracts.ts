import { z } from 'zod';
import type { Prisma } from '@prisma/client';

// Use z.any() for JSON blob fields — Prisma handles serialization,
// and its InputJsonValue type is incompatible with z.record(z.unknown())
const jsonObject = z.record(z.any())
  .refine((v) => JSON.stringify(v).length < 500_000, { message: 'JSON object too large' })
  .transform((v): Prisma.InputJsonValue => v);
const jsonArray = z.array(z.record(z.any()))
  .refine((v) => JSON.stringify(v).length < 500_000, { message: 'JSON array too large' })
  .transform((v): Prisma.InputJsonValue => v);

const versionSchema = z.object({
  name: z.string().min(1),
  formData: jsonObject.default({}),
  personnel: jsonArray.default([]),
  contractTypeId: z.string().optional(),
});

export const createContractSchema = z.object({
  localId: z.union([z.number(), z.string()]).transform((v) => typeof v === 'string' ? parseInt(v, 10) : v),
  contractTypeId: z.string().min(1),
  name: z.string().min(1),
  baseFormData: jsonObject.default({}),
  personnel: jsonArray.default([]),
  versions: z.array(versionSchema).optional(),
  activeVersionIndex: z.number().nullable().optional(),
});

export const updateContractSchema = z.object({
  contractTypeId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  baseFormData: jsonObject.optional(),
  personnel: jsonArray.optional(),
  versions: z.array(versionSchema).optional(),
  activeVersionIndex: z.number().nullable().optional(),
});

export const createVersionSchema = z.object({
  name: z.string().optional(),
  formData: jsonObject.default({}),
  personnel: jsonArray.default([]),
  contractTypeId: z.string().optional(),
});
