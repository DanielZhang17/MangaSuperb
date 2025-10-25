import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Build user avatar URL from avatar_index (1..4)
export function getAvatarUrl(index?: number | null) {
  const i = typeof index === 'number' && index >= 1 && index <= 4 ? index : 1
  const base: string = (import.meta as any).env?.VITE_AVATAR_BASE ?? '/static'
  const cleaned = base.endsWith('/') ? base.slice(0, -1) : base

  return `${cleaned}/avatar${i}.jpg`
}
