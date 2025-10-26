import { atom } from 'jotai'

import type { IComic } from '@/service/types'

export type StoryStep = 'input' | 'panels' | 'generate'

export const storyStepAtom = atom<StoryStep>('input')

export type CharacterStep = 'selection' | 'generate'
export const characterStepAtom = atom<CharacterStep>('selection')

export const mangaTitleAtom = atom('不灭战神')

export const activeTabAtom = atom('story')

export const storyCompletedAtom = atom(false)
export const charactersCompletedAtom = atom(false)
// 选中的人物（仅存 id 数组）
export const selectedCharacterIdsAtom = atom<number[]>([])

// ===== LocalStorage persistence helpers =====
const isBrowser = typeof window !== 'undefined'

function readLS<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLS<T>(key: string, value: T) {
  if (!isBrowser) return
  try {
    if (value === undefined) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {}
}

// 当前故事创建得到的漫画 ID（供生图阶段使用） - 持久化
const baseCurrentComicIdAtom = atom<number | null>(readLS<number | null>('ms_current_comic_id', null))
export const currentComicIdAtom = atom(
  (get) => get(baseCurrentComicIdAtom),
  (_get, set, next: number | null) => {
    set(baseCurrentComicIdAtom, next)
    writeLS('ms_current_comic_id', next)
  },
)

// 当前漫画详情 - 持久化
const baseCurrentComicDetailAtom = atom<IComic | null>(readLS<IComic | null>('ms_current_comic_detail', null))
export const currentComicDetailAtom = atom(
  (get) => get(baseCurrentComicDetailAtom),
  (_get, set, next: IComic | null) => {
    set(baseCurrentComicDetailAtom, next)
    writeLS('ms_current_comic_detail', next)
  },
)

export interface StoryPanel { id: number; text: string }

const initialStoryPanels: StoryPanel[] = [
  {
    id: 1,
    text:
      '秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声，顺着石梯，朝下方滚去。“姓马的，我诅咒你不得好死！”他竭斯底里的怒吼，充满怨毒。',
  },
  {
    id: 2,
    text:
      '好不容易，他才登上顶峰，可是没想到，这个女人竟如此歹毒，这不是摆明的断他活路吗？',
  },
  {
    id: 3,
    text:
      '“还敢诅咒我，真是不知死活，现在我就杀了你！”马红梅眸中杀机闪烁，正要追下去，斩草除根.',
  },
  { id: 4, text: '“发生了什么事？”但就在这时，一道中气十足的喝声，从宫殿内传出.' },
  {
    id: 5,
    text:
      '紧接着。宫殿内走出一个中年男人。他身高七尺，身穿一件紫色的衣服，龙行虎步，双目有神，不怒自威.',
  },
  { id: 6, text: '马红梅黛眉一，转身看向中年男人，躬身道：“见过三殿主。”' },
  { id: 7, text: '三殿主点点头，看着不停朝下面滚去的秦飞扬，皱眉道：“他怎么又来了？' },
  { id: 8, text: '马红梅笑道：“还不是想要洗髓丹.' },
  { id: 9, text: '三殿主疑惑道：“那他怎么滚下去了？”' },
]

// 旧的直存 panels 被下方的派生 atom 替代

// ===== Story content/panels sync =====
// 1) 完整故事（编辑器文本域）作为单一数据源
export const fullStoryAtom = atom(
  initialStoryPanels.map((p) => p.text).join('\n\n'),
)

function splitPanelsFromStory(story: string): StoryPanel[] {
  return story
    .split(/\n\s*\n+/) // 以空行作为分段
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, idx) => ({ id: idx + 1, text }))
}

// 2) Panels 派生自完整故事；写入时回写 fullStoryAtom
export const derivedStoryPanelsAtom = atom(
  (get) => splitPanelsFromStory(get(fullStoryAtom)),
  (get, set, update: StoryPanel[] | ((prev: StoryPanel[]) => StoryPanel[])) => {
    const prev = splitPanelsFromStory(get(fullStoryAtom))
    const next = typeof update === 'function' ? (update as (p: StoryPanel[]) => StoryPanel[])(prev) : update
    const joined = next.map((p) => p.text).join('\n\n')
    set(fullStoryAtom, joined)
  },
)

// 为向后兼容，导出名称保持不变
export { derivedStoryPanelsAtom as storyPanelsAtom }

// ===== Global settings =====
// Style prompt for AI rendering / creation
export const styleAtom = atom<string>('Classic manga black and white linework.')
// Aspect ratio selection
export const aspectRatioAtom = atom<string>('16:9')

// Selected characters extra metadata: role by id
export const selectedCharacterRolesAtom = atom<Record<number, string>>({})

// Optional per-page layout selections (page_number -> layout_key)
export const pageLayoutSelectionAtom = atom<Record<number, string>>({})

// 已移除旧/新故事快照与本地持久化逻辑
