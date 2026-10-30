"use client";

import {
  ChevronRight,
  Download,
  Info,
  LayoutGrid,
  LogOut,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useInstallPrompt } from "@/components/pwa/InstallPrompt";
import { Button, Card, ListRow, Sheet, useToast } from "@/components/ui";
import { resetDemoData } from "@/lib/data/seed";
import { useAuth } from "@/lib/supabase/auth";

/** Shown in the About block; bump with `package.json`. */
export const APP_VERSION = "0.1.0";

export interface ProfileSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Profile → gear: account, install, reset demo data, about. */
export function ProfileSettingsSheet({ open, onClose }: ProfileSettingsSheetProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, demo, signOut } = useAuth();
  const { canInstall, install, iosManualInstall } = useInstallPrompt();

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  function close() {
    setConfirmingReset(false);
    onClose();
  }

  async function handleReset() {
    setResetting(true);
    await resetDemoData();
    setResetting(false);
    setConfirmingReset(false);
    onClose();
    toast({ title: "Demo data restored", tone: "success" });
    router.replace("/home");
  }

  async function handleSignOut() {
    await signOut();
    toast({ title: "Signed out", description: "Your data stays on this device." });
    close();
  }

  async function handleInstall() {
    const accepted = await install();
    if (accepted) toast({ title: "Cookwise installed", tone: "success" });
  }

  return (
    <Sheet open={open} onClose={close} title="Settings">
      <div className="space-y-5 pb-2">
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">
            Account
          </h3>
          <Card padding="sm">
            {demo || !user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text">
                    {demo ? "Local demo mode" : "Not signed in"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-2">
                    Everything is stored on this device.
                  </p>
                </div>
                <Button
                  href="/auth"
                  variant="soft"
                  size="sm"
                  className="shrink-0"
                  onClick={close}
                >
                  Sign in to sync
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-text">
                    {user.email ?? "Signed in"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-2">Syncing with Supabase.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  leftIcon={<LogOut size={14} />}
                  onClick={() => void handleSignOut()}
                >
                  Sign out
                </Button>
              </div>
            )}
          </Card>
        </section>

        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">
            App
          </h3>

          {canInstall && (
            <ListRow
              onClick={() => void handleInstall()}
              divider
              leading={<SettingsTile icon={<Download size={18} />} />}
              title="Install app"
              subtitle="Add Cookwise to your home screen"
              trailing={<ChevronRight size={18} className="text-text-3" aria-hidden="true" />}
            />
          )}

          {iosManualInstall && !canInstall && (
            <ListRow
              divider
              leading={<SettingsTile icon={<Download size={18} />} />}
              title="Install on iPhone"
              subtitle="Tap the Share button, then Add to Home Screen"
            />
          )}

          {confirmingReset ? (
            <Card tone="orange" padding="sm" className="space-y-3">
              <div>
                <p className="text-[14px] font-semibold text-text">Reset demo data?</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-2">
                  This clears the profile, pantry, plans, cooking history and
                  ratings on this device, then loads Santhosh&apos;s demo data again.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirmingReset(false)}
                  disabled={resetting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1"
                  loading={resetting}
                  onClick={() => void handleReset()}
                >
                  Reset
                </Button>
              </div>
            </Card>
          ) : (
            <ListRow
              onClick={() => setConfirmingReset(true)}
              divider
              leading={<SettingsTile icon={<RotateCcw size={18} />} tone="orange" />}
              title="Reset demo data"
              subtitle="Start over with the sample kitchen"
              trailing={<ChevronRight size={18} className="text-text-3" aria-hidden="true" />}
            />
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">
            About Cookwise
          </h3>
          <Card padding="sm" className="space-y-3">
            <div className="flex items-start gap-3">
              <SettingsTile icon={<Info size={18} />} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-text">
                  Cookwise v{APP_VERSION}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-2">
                  Cook smarter, live healthier. Works offline — your kitchen data
                  never leaves this device unless you sign in.
                </p>
              </div>
            </div>
            <Button
              href="/dev/ui"
              variant="secondary"
              size="sm"
              fullWidth
              leftIcon={<LayoutGrid size={14} />}
              onClick={close}
            >
              Component gallery
            </Button>
          </Card>
        </section>
      </div>
    </Sheet>
  );
}

function SettingsTile({
  icon,
  tone = "green",
}: {
  icon: React.ReactNode;
  tone?: "green" | "orange";
}) {
  return (
    <span
      aria-hidden="true"
      className={
        tone === "orange"
          ? "flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"
          : "flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-primary"
      }
    >
      {icon}
    </span>
  );
}
