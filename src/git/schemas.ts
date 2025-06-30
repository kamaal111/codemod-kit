import z from 'zod';

export const DefaultBranchRefSchema = z.object({ defaultBranchRef: z.object({ name: z.string().nonempty() }) });
