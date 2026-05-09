import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CharactersApi from '@/apis/characters'
import type { ICharacter } from '@/service/types'

import { CharacterUpsertDialog } from '../character-upsert-dialog'

vi.mock('@/apis/characters', () => ({
  default: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const createMock = vi.mocked(CharactersApi.create)
const updateMock = vi.mocked(CharactersApi.update)

const providers = {
  providers: {
    gemini: { image: true, text: true },
    third_party: { image: true, text: true },
  },
  defaults: { image: 'gemini', text: 'gemini' },
}

const character: ICharacter = {
  id: 12,
  user_id: 1,
  name: '白石遥',
  description: '旧描述',
  sex: 'female',
  is_public: false,
  style_prompt: null,
  optimized_description: null,
  image_status: 'failed',
  image_url: null,
  image_job_id: null,
  image_error: 'old error',
  created_at: null,
  updated_at: null,
}

describe('CharacterUpsertDialog', () => {
  it('keeps the dialog open when the user clicks outside it', () => {
    const onOpenChange = vi.fn()

    render(
      <CharacterUpsertDialog
        mode="create"
        open
        providers={providers}
        onOpenChange={onOpenChange}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.mouseDown(document.body)
    fireEvent.click(document.body)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('updates an existing character and requests regeneration with the selected provider', async () => {
    const onSaved = vi.fn()
    updateMock.mockResolvedValue({
      character: { ...character, name: '七濑葵', image_status: 'pending' },
      job_id: 'character-job-1',
    } as any)

    render(
      <CharacterUpsertDialog
        mode="edit"
        open
        character={character}
        providers={providers}
        defaultProvider="third_party"
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('人物名称'), { target: { value: '七濑葵' } })
    fireEvent.change(screen.getByLabelText('人物描述'), {
      target: { value: '角色名：七濑葵。短发，轻音乐部。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并重新生成' }))

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(12, {
        name: '七濑葵',
        description: '角色名：七濑葵。短发，轻音乐部。',
        sex: 'female',
        style_prompt: '',
        optimize: false,
        image_provider: 'third_party',
        text_provider: 'third_party',
      })
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })
})
