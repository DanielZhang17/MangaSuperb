export type WorkflowStageName = 'outline' | 'shots' | 'render' | 'export'

export type WorkflowStageStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type RenderProgressStatus =
  | 'idle'
  | 'submitting'
  | 'optimizing'
  | 'rendering'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'timeout'

export interface RenderProgressState {
  status: RenderProgressStatus
  elapsedMs: number
  pollTries: number
  maxPollTries: number
  message: string
  error?: string | null
}
