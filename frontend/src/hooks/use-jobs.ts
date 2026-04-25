import useSWRMutation from 'swr/mutation'

import JobsApi, { type CreateComicJobRequest, type CreateComicJobResponse } from '@/apis/jobs'

const KEY_CREATE_JOB = '/api/jobs'

export function useCreateComicJob() {
  const mutation = useSWRMutation<CreateComicJobResponse, any, string, CreateComicJobRequest>(
    KEY_CREATE_JOB,
    async (_key, { arg }) => JobsApi.createComic(arg),
    { revalidate: false },
  )

  return {
    create: (arg: CreateComicJobRequest) => mutation.trigger(arg),
    state: { isMutating: mutation.isMutating },
  }
}

export default function useJobs() {
  const create = useCreateComicJob()

  return { ...create }
}
