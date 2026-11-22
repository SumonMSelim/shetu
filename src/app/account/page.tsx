import { AppHeader } from "@/components/AppHeader";
import { auth } from "@/auth";
import { AccountData } from "@/components/AccountData";

/**
 * Account data page (self-service GDPR rights).
 *
 * Export everything stored about the account (Art. 15/20) and delete the
 * account and all associated data (Art. 17). Deletion is immediate and
 * irreversible, so the client asks for confirmation first.
 */
export default async function AccountPage() {
  const session = await auth();
  const name = (session?.user as { name?: string } | undefined)?.name;

  return (
    <>
      <AppHeader active="chat" />
      <div className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 40 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Your data</h1>
        <p className="muted" style={{ margin: "0 0 22px", fontSize: 15.5, lineHeight: 1.6 }}>
          Everything Shetu stores about you, in one place: export it as JSON, or
          delete it permanently. {name ? <>Signed in as {name}.</> : null}
        </p>
        <AccountData />
      </div>
    </>
  );
}
