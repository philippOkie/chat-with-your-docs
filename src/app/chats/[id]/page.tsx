import { ChatWorkspace } from "@/features/chat/chat-workspace";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatWorkspace initialChatId={id} />;
}
