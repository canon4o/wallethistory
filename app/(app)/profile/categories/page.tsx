import type { Metadata } from "next";
import { CategoriesManager } from "@/components/categories/CategoriesManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { listCategories } from "@/lib/data/categories";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Categories") };
}

export default async function CategoriesPage() {
  const t = await getT();
  const categories = await listCategories();
  return (
    <>
      <PageHeader title={t("Categories")} />
      <CategoriesManager categories={categories} />
    </>
  );
}
