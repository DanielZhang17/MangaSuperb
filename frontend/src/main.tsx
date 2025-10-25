import './styles/global.css'

import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { RouterProvider } from 'react-router'

import { Providers } from './components/providers/providers'
import router from './router'

createRoot(document.getElementById('root')!).render(
  <Providers>
    <RouterProvider router={router} />
    <Toaster />
  </Providers>,
)
