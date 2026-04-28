import { z } from 'zod'

export const loginSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginInput = z.infer<typeof loginSchema>
