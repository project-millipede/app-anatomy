import type { Metadata } from 'next';
import { ExplorerLayout } from '../../features/explorer/ExplorerLayout';

export const metadata: Metadata = {
  title: 'Application Explorer | Code Workbench',
  description:
    'An Ark workspace preview with fluid panels and illustrative Archer connections.',
};

export default function ExplorerPage() {
  return <ExplorerLayout />;
}
