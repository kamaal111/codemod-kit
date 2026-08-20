import z from 'zod';

export const CodemodConfigSchema = z.object({
  paths: z.array(z.string().nonempty()).nonempty(),
  dry_run: z.boolean().optional(),
  log: z.boolean().optional(),
});

export type CodemodConfig = z.infer<typeof CodemodConfigSchema>;
