'use client';

import { VariantNavigation } from '../../components/VariantNavigation';
import { Workbench as BaseWorkbench } from './base/Workbench';
import { Workbench as ArkWorkbench } from './ark/Workbench';
import { Comparison } from './Comparison';
import { NativeServiceInstallation } from './NativeServiceInstallation';
import { useNativeSession } from './useNativeSession';
import { useWorkbenchModel } from './useWorkbenchModel';
import type { WorkbenchView } from './types';

/**
 * Own the runtime and model for the workbench page, independently of its view.
 * @param props Presentation choice resolved by the page.
 * @returns View navigation and the presentation of the shared workbench model.
 */
export function WorkbenchShell({ view }: { view: WorkbenchView }) {
  const { getNativeSession } = useNativeSession();
  const model = useWorkbenchModel(getNativeSession);

  const presentation = {
    base: <BaseWorkbench model={model} />,
    ark: <ArkWorkbench model={model} />,
    compare: <Comparison model={model} />,
  }[view];

  return (
    <>
      <VariantNavigation view={view} />
      <NativeServiceInstallation />
      {presentation}
    </>
  );
}
