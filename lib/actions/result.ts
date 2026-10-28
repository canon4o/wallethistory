import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

type FieldErrors = Record<string, string[]>;

export type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: FieldErrors;
  /** Machine-readable reason the UI can react to (for example `email_not_verified`). */
  code?: string;
};

/** Every Server Action returns this shape; raw database errors never reach the UI. */
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

export const GENERIC_ERROR = msg("Something went wrong. Please try again.");

/**
 * Translates a failure into the request's language. Actions write their messages as
 * `msg("...")` keys; this is the one place they become text for the user.
 */
export async function localize<T extends ActionFailure>(failure: T): Promise<T> {
  const t = await getT();
  const fieldErrors = failure.fieldErrors
    ? Object.fromEntries(Object.entries(failure.fieldErrors).map(([field, messages]) => [field, messages.map((message) => t(message))]))
    : undefined;
  return { ...failure, error: t(failure.error), ...(fieldErrors ? { fieldErrors } : {}) };
}

/** A plain failure with a translated message. */
export function failure(error: string, code?: string): Promise<ActionFailure> {
  return localize({ ok: false, error, ...(code ? { code } : {}) });
}

export function validationFailure(error: z.ZodError): Promise<ActionFailure> {
  return localize({
    ok: false,
    error: msg("Please fix the highlighted fields."),
    fieldErrors: z.flattenError(error).fieldErrors as FieldErrors,
  });
}

/** A failure attached to one form field (and shown as the form-level message too). */
export function fieldFailure(field: string, message: string): Promise<ActionFailure> {
  return localize({ ok: false, error: message, fieldErrors: { [field]: [message] } });
}

const NOT_FOUND_ERROR = msg("This item no longer exists.");

export function notFoundFailure(error: string = NOT_FOUND_ERROR): Promise<ActionFailure> {
  return failure(error);
}

/**
 * Runs a write and turns unexpected failures into a generic message so raw database errors
 * never reach the UI. Next.js control-flow errors (redirect, notFound) are re-thrown.
 * Expected failures (unique / foreign key violations) are handled by the caller's own try/catch.
 * Failures it returns are translated, so the callback can return `msg("...")` keys.
 */
export async function guarded<T extends ActionResult>(run: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    const result = await run();
    return result.ok ? result : await localize(result);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Server Action failed:", error);
    return failure(GENERIC_ERROR);
  }
}
