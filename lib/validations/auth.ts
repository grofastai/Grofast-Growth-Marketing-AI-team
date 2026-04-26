import { z } from 'zod'

export const loginSchema = z
  .object({
    employee_id: z.string().min(1, 'Employee ID is required'),
    company_slug: z.string().min(1, 'Company is required'),
    password: z.string().min(1, 'Password is required'),
  })
  .transform((val) => ({
    ...val,
    email: `${val.employee_id}@${val.company_slug}.internal`,
  }))

export type LoginInput = z.infer<typeof loginSchema>
