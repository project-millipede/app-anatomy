'use client';

import { Tabs as ArkTabs } from '@ark-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cx } from '../../../styled-system/css';
import { tabs } from '../../../styled-system/recipes';

const styles = tabs();

function List({ className, ...props }: ComponentProps<typeof ArkTabs.List>) {
  return <ArkTabs.List {...props} className={cx(styles.list, className)} />;
}

function Trigger({
  className,
  ...props
}: ComponentProps<typeof ArkTabs.Trigger>) {
  return (
    <ArkTabs.Trigger {...props} className={cx(styles.trigger, className)} />
  );
}

function Content({
  className,
  ...props
}: ComponentProps<typeof ArkTabs.Content>) {
  return (
    <ArkTabs.Content {...props} className={cx(styles.content, className)} />
  );
}

export const Tabs = { Root: ArkTabs.Root, List, Trigger, Content };
