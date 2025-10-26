import { useState } from 'react'
import useSWR from 'swr'

import CharactersApi from '@/apis/characters'
import type {
  CreateCharacterRequest,
  CreateCharacterResponse,
  GetCharacterResponse,
  ListCharactersResponse,
} from '@/service/types'

const KEY_LIST = '/api/characters'

export function useCharactersList() {
  const { data, error, isLoading, mutate } = useSWR<ListCharactersResponse>(KEY_LIST)

  return {
    characters: data?.characters ?? [],
    count: data?.count ?? data?.characters?.length ?? 0,
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useCharacterDetail(id?: number) {
  const key = id ? `/api/characters/${id}` : null
  const { data, error, isLoading, mutate } = useSWR<GetCharacterResponse>(key)

  return {
    character: data?.character,
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useCreateCharacter() {
  const [isMutating, setIsMutating] = useState(false)

  async function create(arg: CreateCharacterRequest): Promise<CreateCharacterResponse> {
    try {
      setIsMutating(true)

      const res = await CharactersApi.create(arg)

      // 可选：创建成功后手动让列表重新拉取（若调用方使用了 useCharactersList）
      // 这里不依赖 SWR，调用方如需刷新可以显式调用 refresh。
      return res
    } finally {
      setIsMutating(false)
    }
  }

  return { create, state: { isMutating } }
}

export default function useCharacters() {
  const list = useCharactersList()
  const create = useCreateCharacter()

  return { ...list, ...create }
}
