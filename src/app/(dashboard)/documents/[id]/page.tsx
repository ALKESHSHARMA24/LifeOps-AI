import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getDocument } from "@/modules/documents/document.service";
import { ExtractionReview } from "./extraction-review";

export default async function DocumentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const doc = await getDocument(session.user.id, params.id);
  if (!doc) notFound();

  return <ExtractionReview document={doc} />;
}
