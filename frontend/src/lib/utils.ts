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

  const url = `${cleaned}/avatar${i}.jpg`
  // Ensure in dev we route storage domain through Vite proxy '/static'

  return proxiedStatic(url)
}

// In dev, storage host has hotlink protection; route via Vite proxy '/static'
export function proxiedStatic(url?: string | null): string {
  if (!url) return ''
  const storageOrigin = 'https://storage.mangasuperb.anranz.xyz'
  const isDev = Boolean((import.meta as any).env?.DEV)

  if (isDev && url.startsWith(storageOrigin)) {
    // Convert absolute storage URL to path-only so dev proxy '/static' can forward correctly
    const path = url.slice(storageOrigin.length)
    // Ensure leading slash

    return path.startsWith('/') ? path : `/${path}`
  }

  return url
}
