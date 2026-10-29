import type { Metadata } from 'next';
import { ApplicationExplorer } from '../../features/explorer/ApplicationExplorer';

export const metadata: Metadata = {
  title: 'Application Explorer | Code Workbench',
  description:
    'Explore native Mach-O dependency declarations or synthetic application relationships.',
};

export default function ExplorerPage() {
  return <ApplicationExplorer />;
}
