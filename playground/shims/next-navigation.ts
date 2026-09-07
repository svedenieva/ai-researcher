// Шим next/navigation для playground: роутинга нет, переходы — в консоль.
export function useRouter() {
  return {
    push: (url: string) => console.log('[playground] router.push', url),
    replace: (url: string) => console.log('[playground] router.replace', url),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}
export function usePathname(): string {
  return typeof location !== 'undefined' ? location.pathname : '/';
}
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
}
export function redirect(_url: string): void {}
export function notFound(): void {}
