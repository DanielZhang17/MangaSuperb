import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'

import { clearActiveJobs } from '@/atoms'

beforeEach(() => {
  clearActiveJobs()
  window.localStorage.clear()
})

afterEach(() => {
  clearActiveJobs()
  window.localStorage.clear()
})
