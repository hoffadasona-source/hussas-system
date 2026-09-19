import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import pattern from './assets/pattern.png';
import { AuthProvider } from './context/AuthContext';
import { UiProvider } from './context/UiContext';
import App from './App';
import { initTableLabels } from './lib/tableLabels';
import './styles/global.css';

document.documentElement.style.setProperty('--pattern', `url("${pattern}")`);
initTableLabels();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <UiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
