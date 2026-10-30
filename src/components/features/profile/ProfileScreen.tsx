"use client";

import {
  ChefHat,
  Clock,
  CookingPot,
  Flame,
  Globe,
  Heart,
  Pencil,
  Salad,
  Settings,
  Target,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import {
  ALLERGY_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  EQUIPMENT_OPTIONS,
  RESTRICTION_OPTIONS,
  SKILL_OPTIONS,
  TIME_OPTIONS,
  labelOf,
  labelsOf,
} from "@/components/features/onboarding/options";
import { AppHeader, Page } from "@/components/layout";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  IconButton,
  Skeleton,
} from "@/components/ui";
import { goalLabel, profileSubtitle } from "@/lib/data/selectors";
import { useHydrated } from "@/lib/data/storage";
import { useProfileStore } from "@/lib/data/stores";
import { hasSchedule, rushedMealCount } from "@/lib/engines/schedule";
import type { UserProfile } from "@/lib/types";
import { formatINR, humanize } from "@/lib/utils";
import { LearningCard } from "./LearningCard";
import { ProfileDetailRow } from "./ProfileDetailRow";
import { ProfileSettingsSheet } from "./ProfileSettingsSheet";

/** `/profile` — the read-only summary of everything onboarding collected. */
/** "Medium" or, with a weekly grid, "Custom week · 4 rushed meals". */
function timeSummary(profile: UserProfile): string {
  if (!hasSchedule(profile.timeSchedule)) {
    return labelOf(TIME_OPTIONS, profile.timeAvailability);
  }
  const rushed = rushedMealCount(profile.timeSchedule, profile.timeAvailability);
  return `Custom week · ${rushed} rushed meal${rushed === 1 ? "" : "s"}`;
}

export function ProfileScreen() {
  const hydrated = useHydrated();
  const profile = useProfileStore((s) => s.profile);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const favourites = profile?.favoriteFoods?.length
    ? profile.favoriteFoods.map(humanize).join(", ")
    : "—";
  const restrictions = profile?.restrictions?.length
    ? labelsOf(RESTRICTION_OPTIONS, profile.restrictions)
    : null;

  return (
    <>
      <AppHeader
        large
        title="Profile"
        right={
          <IconButton aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} />
          </IconButton>
        }
      />

      <Page>
        {!hydrated ? (
          <ProfileSkeleton />
        ) : !profile ? (
          <EmptyState
            emoji="👋"
            title="No profile yet"
            description="Tell Cookwise about your diet, goals and kitchen to get a personalised week."
            actionLabel="Set up Cookwise"
            actionHref="/onboarding"
          />
        ) : (
          <div className="space-y-4">
            <header className="flex flex-col items-center pt-1 pb-1 text-center">
              <Avatar name={profile.name} src={profile.avatarUrl} size={64} />
              <h2 className="mt-3 text-[18px] font-bold text-text">
                {profile.name || "Cookwise user"}
              </h2>
              {profileSubtitle(profile) && (
                <p className="mt-0.5 text-[13px] text-text-2">
                  {profileSubtitle(profile)}
                </p>
              )}
              <Button
                href="/profile/edit"
                variant="soft"
                size="sm"
                className="mt-3"
                leftIcon={<Pencil size={14} />}
              >
                Edit Profile
              </Button>
            </header>

            <Card padding="sm">
              <ProfileDetailRow
                divider
                icon={<Target size={18} />}
                label="Goal"
                value={goalLabel(profile)}
              />
              <ProfileDetailRow
                divider
                icon={<Salad size={18} />}
                label="Diet"
                value={
                  restrictions
                    ? `${labelOf(DIET_OPTIONS, profile.diet)} · ${restrictions}`
                    : labelOf(DIET_OPTIONS, profile.diet)
                }
              />
              <ProfileDetailRow
                divider
                tone="blue"
                icon={<Wallet size={18} />}
                label="Budget"
                value={`< ${formatINR(profile.budgetMonthly)} / month`}
              />
              <ProfileDetailRow
                divider
                icon={<ChefHat size={18} />}
                label="Cooking Skill"
                value={labelOf(SKILL_OPTIONS, profile.skill)}
              />
              <ProfileDetailRow
                divider
                icon={<Clock size={18} />}
                label="Time Available"
                value={timeSummary(profile)}
              />
              <ProfileDetailRow
                divider
                tone="orange"
                icon={<Flame size={18} />}
                label="Spice Preference"
                value={`Level ${profile.spiceLevel}`}
              />
              <ProfileDetailRow
                divider
                icon={<Heart size={18} />}
                label="Favorite Foods"
                value={favourites}
              />
              {profile.cuisines.length > 0 && (
                <ProfileDetailRow
                  divider
                  tone="blue"
                  icon={<Globe size={18} />}
                  label="Cuisines"
                  value={labelsOf(CUISINE_OPTIONS, profile.cuisines)}
                />
              )}
              {profile.allergies.length > 0 && (
                <ProfileDetailRow
                  divider
                  tone="orange"
                  icon={<TriangleAlert size={18} />}
                  label="Allergies"
                  value={labelsOf(ALLERGY_OPTIONS, profile.allergies)}
                />
              )}
              <ProfileDetailRow
                icon={<CookingPot size={18} />}
                label="Equipment"
                value={labelsOf(EQUIPMENT_OPTIONS, profile.equipment)}
              />
            </Card>

            <LearningCard />
          </div>
        )}
      </Page>

      <ProfileSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 pt-1">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-1 h-9 w-32 rounded-full" />
      </div>
      <Skeleton className="h-[380px] rounded-2xl" />
      <Skeleton className="h-[140px] rounded-2xl" />
    </div>
  );
}
