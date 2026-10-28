"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCategory } from "@/lib/actions/categories";
import type { CategoryItem } from "@/lib/data/categories";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { RowTapTarget } from "@/components/ui/RowTapTarget";
import { CategoryBadge } from "./CategoryIcon";
import { CategoryForm } from "./CategoryForm";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

type Dialog =
  | { kind: "create"; type: "income" | "expense" }
  | { kind: "edit"; category: CategoryItem }
  | { kind: "delete"; category: CategoryItem }
  | null;

const GROUPS = [
  { type: "expense", title: msg("Expense categories") },
  { type: "income", title: msg("Income categories") },
] as const;

export function CategoriesManager({ categories }: { categories: CategoryItem[] }) {
  const t = useT();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setDeleteError(null);
  }

  async function confirmDelete(category: CategoryItem) {
    setPending(true);
    setDeleteError(null);
    const result = await deleteCategory(category.id);
    setPending(false);
    if (result.ok) close();
    else setDeleteError(result.error);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {GROUPS.map(({ type, title }) => {
          const items = categories.filter((category) => category.type === type);
          return (
            <section key={type} aria-labelledby={`categories-${type}`} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 id={`categories-${type}`} className="text-sm font-bold">
                  {t(title)}
                </h2>
                <Button onClick={() => setDialog({ kind: "create", type })}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t("Add category")}
                </Button>
              </div>
              {items.length === 0 ? (
                <EmptyState
                  title={type === "expense" ? t("No expense categories") : t("No income categories")}
                  description={
                    type === "expense"
                      ? t("Expense categories group your spending and are used by budgets.")
                      : t("Income categories group the money you receive.")
                  }
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((category) => (
                    <li
                      key={category.id}
                      className="relative flex items-center gap-3 rounded-lg border border-border bg-surface p-2 pl-3"
                    >
                      <CategoryBadge icon={category.icon} color={category.color} />
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">{category.name}</p>
                      <IconButton
                        label={t("Edit {name}", { name: category.name })}
                        className="max-lg:hidden"
                        onClick={() => setDialog({ kind: "edit", category })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={t("Delete {name}", { name: category.name })}
                        className="max-lg:hidden"
                        onClick={() => setDialog({ kind: "delete", category })}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </IconButton>
                      <RowTapTarget
                        label={t("Edit {name}", { name: category.name })}
                        onClick={() => setDialog({ kind: "edit", category })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Modal open={dialog?.kind === "create"} title={t("Add category")} onClose={close}>
        {dialog?.kind === "create" ? (
          <CategoryForm key={dialog.type} defaultType={dialog.type} onDone={close} />
        ) : null}
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t("Edit category")} onClose={close}>
        {dialog?.kind === "edit" ? (
          <CategoryForm
            key={dialog.category.id}
            category={dialog.category}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", category: dialog.category })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("Delete category")}
        description={
          dialog?.kind === "delete"
            ? t("Delete \"{name}\"? A category used by transactions cannot be deleted. Budgets that use it are deleted with it.", {
                name: dialog.category.name,
              })
            : ""
        }
        confirmLabel={t("Delete category")}
        pending={pending}
        error={deleteError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.category)}
        onClose={close}
      />
    </>
  );
}
