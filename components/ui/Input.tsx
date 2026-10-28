import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ id, label, error, hint, className, ...props }: InputProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(controlClass, className)}
        {...props}
      />
    </Field>
  );
}
