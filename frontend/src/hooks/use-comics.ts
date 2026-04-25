import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

import ComicsApi from '@/apis/comics'
import type {
  CreateComicRequest,
  CreateComicResponse,
  IComic,
  ListComicsResponse,
} from '@/service/types'

const KEY_LIST = '/api/comics'

export function useComicsList() {
  const { data, error, isLoading, mutate } = useSWR<ListComicsResponse>(KEY_LIST)

  return {
    comics: data?.comics ?? [],
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useComicDetail(id?: number) {
  const key = id ? `/api/comics/${id}` : null
  const { data, error, isLoading, mutate } = useSWR<IComic>(key)

  return {
    comic: data,
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useCreateComic() {
  const mutation = useSWRMutation<CreateComicResponse, any, string, CreateComicRequest>(
    KEY_LIST,
    async (_key, { arg }) => ComicsApi.create(arg),
    { revalidate: true },
  )

  return {
    create: (arg: CreateComicRequest) => mutation.trigger(arg),
    state: { isMutating: mutation.isMutating },
  }
}

export function useDeleteComic() {
  const mutation = useSWRMutation<{ message: string }, any, string, number>(
    KEY_LIST,
    async (_key, { arg }) => ComicsApi.delete(arg),
    { revalidate: true },
  )

  return {
    deleteComic: (comicId: number) => mutation.trigger(comicId),
    state: { isMutating: mutation.isMutating },
  }
}

export default function useComics() {
  const list = useComicsList()
  const create = useCreateComic()
  const deleteHook = useDeleteComic()

  return { ...list, ...create, ...deleteHook }
}
