import { AppHeader } from "@/components/AppHeader";
import { Chat } from "@/components/Chat";

export default function ChatPage() {
  return (
    <>
      <AppHeader active="chat" />
      <Chat />
    </>
  );
}
