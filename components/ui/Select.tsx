import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLSelectElement>;
};

export function Select({ id, label, error, hint, className, children, ...props }: SelectProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(controlClass, className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
