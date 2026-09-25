"use client";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { AccountSettings } from "@/components/dashboard/account-settings";

export default function Page() {
  return (
    <TeenShell title="Privacy & settings">
      <AccountSettings
        showEmailPrefs
        privacyNotes={[
          "Your profile is never shown publicly or searchable by employers.",
          "Employers only see the information on applications you send them.",
          "TaskTeens never asks for your home address, school schedule, SSN or bank details.",
          "You can withdraw any application at any time.",
        ]}
      />
    </TeenShell>
  );
}
