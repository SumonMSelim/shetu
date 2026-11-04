import { AppHeader } from "@/components/AppHeader";
import { Vault } from "@/components/Vault";

export default function VaultPage() {
  return (
    <>
      <AppHeader active="vault" />
      <Vault />
    </>
  );
}
