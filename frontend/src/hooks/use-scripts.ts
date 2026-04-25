import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

import ScriptsApi from '@/apis/scripts'
import type {
  CreateScriptRequest,
  CreateScriptResponse,
  GetScriptResponse,
  ListScriptsResponse,
} from '@/service/types'

const KEY_LIST = '/api/scripts'

export function useScriptsList() {
  const { data, error, isLoading, mutate } = useSWR<ListScriptsResponse>(KEY_LIST)

  return {
    scripts: data?.scripts ?? [],
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useScriptDetail(id?: number) {
  const key = id ? `/api/scripts/${id}` : null
  const { data, error, isLoading, mutate } = useSWR<GetScriptResponse>(key)

  return {
    script: data,
    loading: isLoading,
    error,
    refresh: () => mutate(),
  }
}

export function useCreateScript() {
  const mutation = useSWRMutation<CreateScriptResponse, any, string, CreateScriptRequest>(
    KEY_LIST,
    async (_key, { arg }) => ScriptsApi.create(arg),
    { revalidate: true },
  )

  return {
    create: (arg: CreateScriptRequest) => mutation.trigger(arg),
    state: { isMutating: mutation.isMutating },
  }
}

export default function useScripts() {
  const list = useScriptsList()
  const create = useCreateScript()

  return { ...list, ...create }
}
