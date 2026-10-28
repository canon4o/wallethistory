"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteTag } from "@/lib/actions/tags";
import type { TagItem } from "@/lib/data/tags";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { RowTapTarget } from "@/components/ui/RowTapTarget";
import { TagForm } from "./TagForm";
import { useT } from "@/lib/i18n/client";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; tag: TagItem }
  | { kind: "delete"; tag: TagItem }
  | null;

export function TagsManager({ tags }: { tags: TagItem[] }) {
  const t = useT();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setDeleteError(null);
  }

  async function confirmDelete(tag: TagItem) {
    setPending(true);
    setDeleteError(null);
    const result = await deleteTag(tag.id);
    setPending(false);
    if (result.ok) close();
    else setDeleteError(result.error);
  }

  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <Plus className="size-4" aria-hidden="true" />
      {t("Add tag")}
    </Button>
  );

  return (
    <>
      {tags.length === 0 ? (
        <EmptyState
          title={t("No tags yet")}
          description={t("Tags are free-form labels you can add to transactions, like “vacation” or “work”.")}
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">{addButton}</div>
          <ul className="flex flex-col gap-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="relative flex items-center gap-2 rounded-lg border border-border bg-surface p-2 pl-3"
              >
                <p className="min-w-0 flex-1 truncate text-sm font-bold">{tag.name}</p>
                <IconButton
                  label={t("Edit {name}", { name: tag.name })}
                  className="max-lg:hidden"
                  onClick={() => setDialog({ kind: "edit", tag })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t("Delete {name}", { name: tag.name })}
                  className="max-lg:hidden"
                  onClick={() => setDialog({ kind: "delete", tag })}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </IconButton>
                <RowTapTarget label={t("Edit {name}", { name: tag.name })} onClick={() => setDialog({ kind: "edit", tag })} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={dialog?.kind === "create"} title={t("Add tag")} onClose={close}>
        <TagForm onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} title={t("Edit tag")} onClose={close}>
        {dialog?.kind === "edit" ? (
          <TagForm
            key={dialog.tag.id}
            tag={dialog.tag}
            onDone={close}
            onDelete={() => setDialog({ kind: "delete", tag: dialog.tag })}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("Delete tag")}
        description={
          dialog?.kind === "delete"
            ? t("Delete \"{name}\"? It is removed from any transactions that use it. The transactions are kept.", { name: dialog.tag.name })
            : ""
        }
        confirmLabel={t("Delete tag")}
        pending={pending}
        error={deleteError}
        onConfirm={() => dialog?.kind === "delete" && confirmDelete(dialog.tag)}
        onClose={close}
      />
    </>
  );
}
