import { useEffect } from 'react';

export function useTheme(theme: string): void {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
}
