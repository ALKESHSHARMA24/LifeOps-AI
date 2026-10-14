import { Metadata } from "next";
import { auth } from "@/auth";
import { listConversations } from "@/modules/conversations/conversation.service";
import ChatClient from "./chat-client";

export const metadata: Metadata = { title: "Ask LifeOps — Chat" };

export default async function ChatPage() {
  const session = await auth();
  const conversations = session?.user?.id
    ? await listConversations(session.user.id)
    : [];

  return <ChatClient initialConversations={conversations} />;
}
