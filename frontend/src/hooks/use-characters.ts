import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

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
    character: data,
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useCreateCharacter() {
  const mutation = useSWRMutation<CreateCharacterResponse, any, string, CreateCharacterRequest>(
    KEY_LIST,
    async (_key, { arg }) => CharactersApi.create(arg),
    { revalidate: true },
  )

  return {
    create: (arg: CreateCharacterRequest) => mutation.trigger(arg),
    state: { isMutating: mutation.isMutating },
  }
}

export default function useCharacters() {
  const list = useCharactersList()
  const create = useCreateCharacter()

  return { ...list, ...create }
}
