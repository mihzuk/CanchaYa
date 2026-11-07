import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import './styles/global.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root');

createRoot(raiz).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
