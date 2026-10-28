import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { Field, controlClass, describedBy } from "./Field";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ id, label, error, hint, className, ...props }: TextareaProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(controlClass, "min-h-20 py-2", className)}
        {...props}
      />
    </Field>
  );
}
