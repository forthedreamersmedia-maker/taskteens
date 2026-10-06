"use client";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { AccountSettings } from "@/components/dashboard/account-settings";

export default function Page() {
  return (
    <ParentShell title="Settings">
      <AccountSettings
        privacyNotes={[
          "Your account is separate from your teen's. Messages you send are labeled “Parent/Guardian message”.",
          "Employers never see your contact details, and never see your teen's live location.",
          "You can withdraw consent at any time from your dashboard.",
        ]}
      />
    </ParentShell>
  );
}
