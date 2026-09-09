// Shim for `next/link` inside the Claude Design bundle. The real component needs
// the Next router; here a plain <a> is enough for a static design mockup.
import type { ReactNode, AnchorHTMLAttributes } from 'react';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string;
  children?: ReactNode;
};

export default function Link({ href = '#', children, ...rest }: Props) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
