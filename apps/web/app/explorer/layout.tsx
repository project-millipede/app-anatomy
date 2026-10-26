import type { ReactNode } from 'react';
import { VariantNavigation } from '../../components/VariantNavigation';

/** Own the Explorer's presentation chrome without mounting a native session. */
export default function ExplorerRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="ark-theme">
      <VariantNavigation view="explorer" />
      {children}
    </div>
  );
}
