const isDev = import.meta.env.VITE_ENVIRONMENT === 'development';

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000',
  development: {
    bypassAuth: isDev,
  },
  features: {
    puzzles: isDev,
  },
};
