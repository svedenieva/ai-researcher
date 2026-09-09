// Shim for `next/navigation` used only inside the Claude Design bundle.
// The real hook throws when called outside a Next.js app ("invariant expected
// app router to be mounted") — that was the white screen. Here it returns an
// inert router so the page renders as a design mockup: navigation is a no-op.
const noop = () => {};

export function useRouter() {
  return {
    push: noop,
    replace: noop,
    refresh: noop,
    back: noop,
    forward: noop,
    prefetch: noop,
  };
}

export function usePathname() {
  return '/';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useParams() {
  return {};
}

export function redirect() {}
export function notFound() {}
