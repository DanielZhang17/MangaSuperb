import { atom } from 'jotai'

import type { AiProviderId } from '@/service/types'
import type { IComic } from '@/service/types'
import type { AutoCharacterPrepareResponse, AutoPreference, ColorMode, RenderRun, WorkflowPreferenceFields } from '@/service/types'

export type StoryStep = 'input' | 'panels' | 'generate'

export type WorkflowMode = 'auto' | 'pro'

export const WORKFLOW_MODE_STORAGE_KEY = 'mangasuperb.comics.workflowMode'

function isWorkflowMode(value: unknown): value is WorkflowMode {
  return value === 'auto' || value === 'pro'
}

function readStoredWorkflowMode(): WorkflowMode {
  if (typeof window === 'undefined') return 'auto'

  try {
    const storedMode = window.localStorage.getItem(WORKFLOW_MODE_STORAGE_KEY)

    return isWorkflowMode(storedMode) ? storedMode : 'auto'
  } catch {
    return 'auto'
  }
}

function persistWorkflowMode(mode: WorkflowMode) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(WORKFLOW_MODE_STORAGE_KEY, mode)
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

const workflowModeValueAtom = atom<WorkflowMode>(readStoredWorkflowMode())

export const workflowModeAtom = atom<WorkflowMode, [WorkflowMode], void>(
  (get) => get(workflowModeValueAtom),
  (_get, set, nextMode) => {
    const mode = isWorkflowMode(nextMode) ? nextMode : 'auto'

    set(workflowModeValueAtom, mode)
    persistWorkflowMode(mode)
  },
)

export type CurrentComicOverrides = Partial<WorkflowPreferenceFields> & {
  color_mode?: AutoPreference<ColorMode>
}

export const currentComicOverridesAtom = atom<CurrentComicOverrides>({})

export const autoCharacterReviewAtom = atom<AutoCharacterPrepareResponse | null>(null)

export const autoCharacterReviewStoryAtom = atom<string | null>(null)

export const activeRenderRunAtom = atom<RenderRun | null>(null)

export const storyStepAtom = atom<StoryStep>('input')

export type CharacterStep = 'selection' | 'generate'
export const characterStepAtom = atom<CharacterStep>('selection')

export const mangaTitleAtom = atom('不灭战神')

export const activeTabAtom = atom('story')

export const storyCompletedAtom = atom(false)
export const charactersCompletedAtom = atom(false)
// 选中的人物（仅存 id 数组）
export const selectedCharacterIdsAtom = atom<number[]>([])

export const currentComicIdAtom = atom<number | null>(null)

export const currentComicDetailAtom = atom<IComic | null>(null)

export interface StoryPanel { id: number; text: string }

const initialStoryPanels: StoryPanel[] = [
//   {
//     id: 1,
//     text:
//       '秦飞扬就宛如一个皮球般，伴随着痛苦的惨叫声，顺着石梯，朝下方滚去。“姓马的，我诅咒你不得好死！”他竭斯底里的怒吼，充满怨毒。',
//   },
//   {
//     id: 2,
//     text:
//       '好不容易，他才登上顶峰，可是没想到，这个女人竟如此歹毒，这不是摆明的断他活路吗？',
//   },
//   {
//     id: 3,
//     text:
//       '“还敢诅咒我，真是不知死活，现在我就杀了你！”马红梅眸中杀机闪烁，正要追下去，斩草除根.',
//   },
//   { id: 4, text: '“发生了什么事？”但就在这时，一道中气十足的喝声，从宫殿内传出.' },
//   {
//     id: 5,
//     text:
//       '紧接着。宫殿内走出一个中年男人。他身高七尺，身穿一件紫色的衣服，龙行虎步，双目有神，不怒自威.',
//   },
//   { id: 6, text: '马红梅黛眉一，转身看向中年男人，躬身道：“见过三殿主。”' },
//   { id: 7, text: '三殿主点点头，看着不停朝下面滚去的秦飞扬，皱眉道：“他怎么又来了？' },
//   { id: 8, text: '马红梅笑道：“还不是想要洗髓丹.' },
//   { id: 9, text: '三殿主疑惑道：“那他怎么滚下去了？”' },
  { id: 1, text: 'Two siblings discover a hidden mech in the forest.' },
]

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

export const derivedStoryPanelsAtom = atom(
  (get) => splitPanelsFromStory(get(fullStoryAtom)),
  (get, set, update: StoryPanel[] | ((prev: StoryPanel[]) => StoryPanel[])) => {
    const prev = splitPanelsFromStory(get(fullStoryAtom))
    const next = typeof update === 'function' ? (update as (p: StoryPanel[]) => StoryPanel[])(prev) : update
    const joined = next.map((p) => p.text).join('\n\n')
    set(fullStoryAtom, joined)
  },
)

export { derivedStoryPanelsAtom as storyPanelsAtom }

export const styleAtom = atom<string>('Classic manga black and white linework.')
export const aspectRatioAtom = atom<string>('16:9')

export const selectedCharacterRolesAtom = atom<Record<number, string>>({})

export const pageLayoutSelectionAtom = atom<Record<number, string>>({})

export const textProviderAtom = atom<AiProviderId>('gemini')

export const imageProviderAtom = atom<AiProviderId>('gemini')
