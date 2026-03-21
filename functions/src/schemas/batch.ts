import { z } from 'zod';

export const batchPendingQuerySchema = z.object({
  localId: z.coerce.number().int().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  batchId: z.string().uuid().optional(),
});

export const updateParsedDataSchema = z.object({
  parsedData: z.record(z.unknown()),
});
