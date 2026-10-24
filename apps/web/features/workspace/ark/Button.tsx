import type { ComponentProps } from 'react';
import { cx } from '../../../styled-system/css';
import {
  button,
  type ButtonVariantProps,
} from '../../../styled-system/recipes';

type ButtonProps = ComponentProps<'button'> & ButtonVariantProps;

export function Button({
  variant,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(button({ variant }), className)}
    />
  );
}
