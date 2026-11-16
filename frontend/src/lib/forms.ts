import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";

/**
 * Mostra o erro da API no formulário: problemas de validação (422) vão para o campo
 * correspondente; o resto vira um toast.
 */
export function handleFormError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
) {
  if (err instanceof ApiError && err.issues.length) {
    let shown = false;
    for (const issue of err.issues) {
      const field = issue.path.split(".")[0];
      if (fields.includes(field)) {
        setError(field as Path<T>, { message: issue.message });
        shown = true;
      }
    }
    if (shown) return;
  }
  toast.error(errorMessage(err));
}
