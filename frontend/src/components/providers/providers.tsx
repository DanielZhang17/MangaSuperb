import { SWRConfig } from 'swr'

import request from '@/service'

import { ThemeProvider } from './theme-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SWRConfig
        value={{
          fetcher: (key: string) => request<void, any>({ url: key, method: 'GET' }),
          revalidateOnFocus: false,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </ThemeProvider>
  )
}