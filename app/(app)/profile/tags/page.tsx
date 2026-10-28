import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { TagsManager } from "@/components/tags/TagsManager";
import { listTags } from "@/lib/data/tags";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Tags") };
}

export default async function TagsPage() {
  const t = await getT();
  const tags = await listTags();
  return (
    <>
      <PageHeader title={t("Tags")} />
      <TagsManager tags={tags} />
    </>
  );
}
