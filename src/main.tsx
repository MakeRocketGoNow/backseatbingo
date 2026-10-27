import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { PwaUpdates } from '@app/components/PwaUpdates';
import { ToastProvider } from '@app/components/Toast';
import { GameProvider } from '@app/store/game';
import { router } from '@app/router';
import './styles/global.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GameProvider>
        <ToastProvider>
          <PwaUpdates />
          <RouterProvider router={router} />
        </ToastProvider>
      </GameProvider>
    </QueryClientProvider>
  </StrictMode>,
);
