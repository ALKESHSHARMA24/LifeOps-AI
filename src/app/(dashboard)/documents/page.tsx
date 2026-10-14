import { auth } from "@/auth";
import { listDocuments } from "@/modules/documents/document.service";
import { DocumentsClient } from "./documents-client";

// Server component: fetches data, passes to client component for interactivity
export default async function DocumentsPage() {
  const session = await auth();
  const documents = session?.user?.id
    ? await listDocuments(session.user.id)
    : [];

  return <DocumentsClient initialDocuments={documents} />;
}
