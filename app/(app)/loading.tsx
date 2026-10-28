import { Spinner } from "@/components/ui/Spinner";
import { getT } from "@/lib/i18n/server";

// Shown while any page in the app section is loading.
export default async function Loading() {
  const t = await getT();
  return (
    <div className="flex justify-center py-16">
      <Spinner label={t("Loading page")} />
    </div>
  );
}
