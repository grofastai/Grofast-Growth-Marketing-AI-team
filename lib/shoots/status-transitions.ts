export type ShootStatus = 'scheduled' | 'going' | 'completed' | 'cancelled'

const VALID_TRANSITIONS: Record<ShootStatus, ShootStatus[]> = {
  scheduled: ['going', 'cancelled'],
  going: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function isValidShootTransition(from: ShootStatus, to: ShootStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}
