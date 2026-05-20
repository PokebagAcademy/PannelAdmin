import { z } from 'zod'

export const createMachineSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, 'Lettres, chiffres, - et _ uniquement'),
  description: z.string().max(280).optional().nullable(),
  host: z.string().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(64),
  authType: z.enum(['key', 'password']),
  secret: z.string().min(1),
})

export type CreateMachineInput = z.infer<typeof createMachineSchema>
