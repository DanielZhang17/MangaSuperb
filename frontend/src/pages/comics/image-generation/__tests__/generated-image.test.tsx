import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GeneratedImage } from '../generated-image'

describe('GeneratedImage', () => {
  it('shows a retryable error state when an image fails to load', () => {
    const retry = vi.fn()

    render(
      <GeneratedImage
        src="https://magastorage.anranz.xyz/manga/page.png"
        alt="page preview"
        onRetry={retry}
      />,
    )

    fireEvent.error(screen.getByAltText('page preview'))

    expect(screen.getByRole('alert')).toHaveTextContent('图片加载失败')

    fireEvent.click(screen.getByRole('button', { name: '重试加载图片' }))

    expect(retry).toHaveBeenCalledTimes(1)
  })
})
