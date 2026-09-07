// Шим next/link → обычная <a>. Достаточно для дизайн-ревью (переходов нет).
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string };
  children?: ReactNode;
};

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, children, ...rest }, ref) {
  const url = typeof href === 'string' ? href : href?.pathname ?? '#';
  return (
    <a ref={ref} href={url} {...rest}>
      {children}
    </a>
  );
});

export default Link;
