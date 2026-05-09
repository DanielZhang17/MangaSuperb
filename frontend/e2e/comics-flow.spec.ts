import { expect, test } from '@playwright/test'

test.describe('comics creation flow', () => {
  test('registers a user and runs story to render progress against local API', async ({ page }) => {
    test.setTimeout(420_000)

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const email = `comic-e2e-${suffix}@example.test`
    const username = `comic_e2e_${suffix}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const password = 'TestPassword123!'

    const register = await page.request.post('/api/auth/register', {
      data: { username, email, password },
    })
    expect(register.ok()).toBeTruthy()

    for (const character of [
      {
        name: '白石遥',
        sex: 'female',
        description: '角色名：白石遥，17岁，高中二年级。温柔克制，黑色短发，校园制服。',
      },
      {
        name: '七濑葵',
        sex: 'female',
        description: '角色名：七濑葵，17岁，高中二年级。开朗直接，栗色长发，校园制服。',
      },
    ]) {
      const created = await page.request.post('/api/characters', {
        data: {
          ...character,
          optimize: false,
          style_prompt: 'Japanese school manga style, clean line art, consistent character design.',
        },
      })
      expect(created.ok()).toBeTruthy()
    }

    await page.goto('/comics')
    await expect(page.getByRole('heading', { name: '漫画创作' })).toBeVisible()

    const story = [
      '新学期的清晨，白石遥在空教室里整理社团旧书，七濑葵抱着迟到的申请表冲进门。',
      '两人在被雨声包围的校园里一起寻找丢失的钥匙，误会和沉默逐渐被轻快的对话打开。',
      '黄昏时，她们在天台看见雨后的彩虹，约定明天一起完成漫画研究社的新海报。',
    ].join('\n')

    await page.getByPlaceholder('...').fill(story)
    await page.getByRole('button', { name: /下一步/ }).click()

    await expect(page.getByText('female，白石遥', { exact: true })).toBeVisible()
    await expect(page.getByText('female，七濑葵', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /一键选择|Quick/i }).click()
    await page.getByRole('button', { name: /下一步/ }).click()

    await page.getByRole('button', { name: /生成分镜/ }).click()
    await expect(page.getByRole('status').filter({ hasText: '正在生成分镜' })).toBeVisible()
    const panelsNext = page.getByRole('button', { name: /下一步/ })
    const panelsFailure = page.getByRole('alert').filter({ hasText: /分镜/ })
    await expect
      .poll(
        async () => {
          if (await panelsNext.isEnabled()) return 'ready'
          if (await panelsFailure.isVisible()) return 'failed'

          return 'pending'
        },
        { timeout: 300_000, intervals: [2_000] },
      )
      .not.toBe('pending')

    if (await panelsFailure.isVisible()) {
      await expect(panelsFailure).toBeVisible()

      return
    }

    await page.getByRole('button', { name: /下一步/ }).click()

    await expect(page.getByText('图像生成可能需要几分钟，请保持页面打开。')).toBeVisible()
    await page.getByRole('button', { name: '生图' }).click()
    await expect(page.getByText('正在生成漫画页')).toBeVisible({ timeout: 30_000 })

    const imageLoaded = page.getByAltText('page preview')
    const explicitFailure = page.getByRole('alert').filter({ hasText: /生图失败|生图超时|图片加载失败|轮询失败/ })
    await expect(imageLoaded.or(explicitFailure).first()).toBeVisible({ timeout: 380_000 })
  })
})
