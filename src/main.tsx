import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App/000--App/App'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './App/100--Home/Home'
import InterviewForm from './App/200--Interview/InterviewForm'

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        {
          index: true,
          element: <Home />
        },
        {
          path: "interviews/new",
          element: <InterviewForm />
        }
      ]
    }
  ]
)


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
