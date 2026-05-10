import type { IComic } from '@/service/types'

import type { CurrentComicOverrides } from '../atoms'

function sortedComicCharacters(comic: IComic): any[] {
  const characters = Array.isArray(comic.characters) ? comic.characters : []

  return [...characters].sort((a, b) => Number(a?.order_index ?? 0) - Number(b?.order_index ?? 0))
}

export function extractCharacterIds(comic: IComic): number[] {
  return sortedComicCharacters(comic)
    .map((character) => Number(character?.character_id ?? character?.id))
    .filter((id): id is number => Number.isFinite(id))
}

export function extractCharacterRoles(comic: IComic): Record<number, string> {
  return sortedComicCharacters(comic).reduce<Record<number, string>>((roles, character) => {
    const id = Number(character?.character_id ?? character?.id)
    const role = typeof character?.role === 'string' ? character.role : ''

    if (Number.isFinite(id) && role) {
      roles[id] = role
    }

    return roles
  }, {})
}

function parseScriptPayload(comic: IComic): Record<string, any> | string | null {
  const rawContent = comic.script?.content ?? comic.script_content ?? comic.story ?? null

  if (rawContent && typeof rawContent === 'object') {
    return rawContent as Record<string, any>
  }

  if (typeof rawContent !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(rawContent)

    return typeof parsed === 'object' && parsed !== null ? parsed : rawContent
  } catch {
    return rawContent
  }
}

export function extractComicStory(comic: IComic): string {
  const payload = parseScriptPayload(comic)

  if (typeof payload === 'string') {
    return payload
  }

  const story = payload?.story ?? comic.story

  return typeof story === 'string' ? story : ''
}

function extractScriptField(comic: IComic, field: string): string | null {
  const payload = parseScriptPayload(comic)
  const value = typeof payload === 'object' && payload ? payload[field] : null

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function inferResumeTab(comic: IComic): string {
  const workflowStage = typeof comic.workflow_stage === 'string' ? comic.workflow_stage : ''
  const pages = Array.isArray(comic.pages) ? comic.pages : []
  const shots = Array.isArray(comic.panel_shots) ? comic.panel_shots : []
  const layouts = Array.isArray(comic.page_layouts) ? comic.page_layouts : []

  if (
    ['render', 'cover', 'export', 'publish'].includes(workflowStage)
    || pages.some((page) => Boolean(page?.image_url))
  ) {
    return 'image-generation'
  }

  if (workflowStage === 'shots' || shots.length > 0 || layouts.length > 0) {
    return 'panels'
  }

  if (workflowStage === 'characters' || extractCharacterIds(comic).length > 0) {
    return 'characters'
  }

  return 'story'
}

export function getComicWorkflowHydration(comic: IComic) {
  const style = comic.style_description || extractScriptField(comic, 'style_description') || ''
  const aspectRatio = comic.aspect_ratio || extractScriptField(comic, 'aspect_ratio') || ''
  const colorMode = extractScriptField(comic, 'color_mode')
  const overrides: CurrentComicOverrides = {}

  if (style) {
    overrides.style = { mode: 'manual', value: style }
  }

  if (aspectRatio) {
    overrides.aspect_ratio = { mode: 'manual', value: aspectRatio }
  }

  if (colorMode === 'black-white' || colorMode === 'color') {
    overrides.color_mode = { mode: 'manual', value: colorMode }
  }

  return {
    comicId: Number(comic.id),
    title: comic.title || '未命名',
    story: extractComicStory(comic),
    style,
    aspectRatio,
    characterIds: extractCharacterIds(comic),
    characterRoles: extractCharacterRoles(comic),
    resumeTab: inferResumeTab(comic),
    overrides,
  }
}
