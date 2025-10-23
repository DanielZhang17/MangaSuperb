import { atom } from 'jotai'

export type StoryStep = 'input' | 'panels' | 'generate'

export const storyStepAtom = atom<StoryStep>('input')

export type CharacterStep = 'selection' | 'generate'
export const characterStepAtom = atom<CharacterStep>('selection')

export const mangaTitleAtom = atom('不灭战神')

export const activeTabAtom = atom('story')

export const storyCompletedAtom = atom(false)
export const charactersCompletedAtom = atom(false)

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

export const storyPanelsAtom = atom<StoryPanel[]>(initialStoryPanels)
