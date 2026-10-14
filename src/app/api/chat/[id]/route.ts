import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, getAllMessages } from "@/modules/conversations/conversation.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await getConversation(session.user.id, params.id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await getAllMessages(params.id);

  return NextResponse.json({ conversation, messages });
}
