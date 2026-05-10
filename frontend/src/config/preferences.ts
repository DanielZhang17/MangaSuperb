import type { ColorMode, UserStylePreset } from '@/service/types'

export const DEFAULT_STYLE_PRESETS: UserStylePreset[] = [
  {
    value: 'Classic manga black and white linework.',
    label: '经典黑白漫画线稿',
    is_custom: false,
  },
  {
    value: 'High-contrast ink with splashy gradients',
    label: '高对比墨线 + 渐变',
    is_custom: false,
  },
  {
    value: 'Moebius-inspired clean lines, minimal shading',
    label: '莫比乌斯风·干净线条',
    is_custom: false,
  },
  {
    value: 'Gritty seinen style with textured shading',
    label: '青年向质感阴影',
    is_custom: false,
  },
]

export const DEFAULT_LAYOUT_OPTIONS = ['auto-grid', 'grid-2x2', 'vertical', 'cinematic'] as const

export const DEFAULT_COLOR_MODES: ColorMode[] = ['black-white', 'color']

export const DEFAULT_ASPECT_RATIOS = ['16:9', '4:3', '3:4', '1:1', '2:3', '3:2'] as const

export const DEFAULT_FONT_FAMILIES = ['source-han-sans', 'yahei', 'heiti', 'songti'] as const

export const DEFAULT_FONT_SIZES = ['18', '20', '22', '24', '28'] as const

export const DEFAULT_BUBBLE_SHAPES = ['rect', 'round'] as const

export const DEFAULT_SELECTED_STYLE = DEFAULT_STYLE_PRESETS[0]!.value
