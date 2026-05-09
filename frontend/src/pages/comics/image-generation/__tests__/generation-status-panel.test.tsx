import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GenerationStatusPanel } from '../generation-status-panel'

describe('GenerationStatusPanel', () => {
  it('does not present idle state as an active loading step', () => {
    render(
      <GenerationStatusPanel
        progress={{
          status: 'idle',
          elapsedMs: 0,
          pollTries: 0,
          maxPollTries: 180,
          message: '准备生成漫画页',
        }}
      />,
    )

    expect(screen.getByText('准备生成漫画页')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/已用时/)).not.toBeInTheDocument()
  })

  it('explains the long-running render state with stage and elapsed time', () => {
    render(
      <GenerationStatusPanel
        progress={{
          status: 'rendering',
          elapsedMs: 125_000,
          pollTries: 63,
          maxPollTries: 180,
          message: '正在生成漫画页',
        }}
      />,
    )

    expect(screen.getByText('正在生成漫画页')).toBeInTheDocument()
    expect(screen.getByText('图像生成可能需要几分钟，请保持页面打开。')).toBeInTheDocument()
    expect(screen.getByText('已用时 2分05秒')).toBeInTheDocument()
    expect(screen.getByText('R2 上传与整理')).toBeInTheDocument()
  })
})
