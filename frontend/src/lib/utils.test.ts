import { describe, expect, it } from 'vitest'

import { proxiedStatic } from './utils'

describe('proxiedStatic', () => {
  it('routes known storage domains through the dev proxy path', () => {
    expect(
      proxiedStatic('https://storage.mangasuperb.anranz.xyz/static/logo.png'),
    ).toBe('/static/logo.png')

    expect(
      proxiedStatic('https://magastorage.anranz.xyz/manga/2026/05/08/page.png'),
    ).toBe('/manga/2026/05/08/page.png')
  })
})
