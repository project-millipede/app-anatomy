import { WorkbenchShell } from '../features/workspace/WorkbenchShell';

/**
 * Resolve presentation without changing the client shell's identity.
 * @param props Page query parameters.
 * @returns The same shell component for every presentation choice.
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const { view } = await searchParams;
  const selectedView = view === 'ark' || view === 'compare' ? view : 'base';
  return <WorkbenchShell view={selectedView} />;
}
