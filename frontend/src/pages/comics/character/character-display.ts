import type { ICharacter } from '@/service/types'

const GENERIC_NAME_PATTERNS = [
  /^角色[-_\s]*\d+$/i,
  /^character[-_\s]*\d+$/i,
  /^unnamed/i,
  /^未命名/,
]

const NAME_PATTERNS = [
  /角色名\s*[：:]\s*([^，,。\n\r]+)/,
  /姓名\s*[：:]\s*([^，,。\n\r]+)/,
  /名字\s*[：:]\s*([^，,。\n\r]+)/,
  /name\s*[：:]\s*([^，,。\n\r]+)/i,
]

type CharacterLike = Partial<ICharacter> & { id?: number }

function isGenericName(name: string) {
  const normalized = name.trim()

  return !normalized || GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function getCharacterDisplayName(character: CharacterLike): string {
  const stored = (character.name || '').trim()
  if (!isGenericName(stored)) return stored

  const description = `${character.description || ''}\n${character.optimized_description || ''}`
  for (const pattern of NAME_PATTERNS) {
    const match = description.match(pattern)
    const extracted = match?.[1]?.trim()
    if (extracted) return extracted
  }

  if (stored) return stored

  return typeof character.id === 'number' ? `角色 #${character.id}` : '未命名角色'
}

export function getCharacterImageState(character: CharacterLike): {
  kind: 'ready' | 'pending' | 'failed' | 'empty'
  label: string
  detail?: string
  title?: string
} {
  if (character.image_url) {
    return { kind: 'ready', label: '形象已生成' }
  }

  if (character.image_status === 'failed') {
    const rawError = character.image_error || ''

    return {
      kind: 'failed',
      label: '形象生成失败',
      detail: rawError ? summarizeCharacterImageError(rawError) : '历史任务失败，可继续选择该人物用于分镜。',
      title: rawError || undefined,
    }
  }

  if (character.image_status === 'pending' || character.image_status === 'processing') {
    return {
      kind: 'pending',
      label: '形象生成中',
      detail: '人物可先用于分镜，图片生成完成后会自动显示。',
    }
  }

  return {
    kind: 'empty',
    label: '暂无图片',
    detail: '该人物还没有可用形象。',
  }
}

function summarizeCharacterImageError(error: string): string {
  const normalized = error.trim()
  const lower = normalized.toLowerCase()

  if (/\b503\b/.test(normalized)) {
    return '服务端返回 503，可编辑后重新生成。'
  }

  if (/\b524\b/.test(normalized) || lower.includes('timeout') || lower.includes('timed out')) {
    return '请求超时，可稍后重新生成。'
  }

  if (lower.includes('rate limit')) {
    return '请求频率受限，可稍后重新生成。'
  }

  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized
}
