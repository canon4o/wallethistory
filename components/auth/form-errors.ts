import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionFailure } from "@/lib/actions/result";

/** Copies server-side field errors from a failed action onto the react-hook-form fields. */
export function applyFieldErrors<T extends FieldValues>(
  failure: ActionFailure,
  setError: UseFormSetError<T>,
) {
  for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
    setError(field as Path<T>, { type: "server", message: messages[0] });
  }
}
