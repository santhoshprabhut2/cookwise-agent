"use client";

import { routes } from "@/lib/routes";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppHeader, Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Card,
  Chip,
  IconButton,
  Input,
  SectionHeader,
  SegmentedControl,
  Select,
  Sheet,
  StatPill,
  StatPillRow,
  Stepper,
  Textarea,
  useToast,
} from "@/components/ui";
import { INGREDIENTS } from "@/lib/data/seed/ingredients";
import { usePlanStore, useProfileStore, useRecipeStore } from "@/lib/data/stores";
import { COMPLETE_MEAL_MIN_CARBS_G } from "@/lib/engines/constants";
import {
  METHOD_TEMP_C,
  buildCustomRecipe,
  validateCustomFood,
  type CustomFoodInput,
  type CustomKind,
} from "@/lib/engines/custom";
import { isStaple } from "@/lib/engines/meals";
import type { CookingMethod, ID, Ingredient, MealType } from "@/lib/types";
import { humanize } from "@/lib/utils";
import { defaultGrams, upcomingUses } from "./filters";
import { IngredientPickerSheet } from "./IngredientPickerSheet";

const BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));

const EMOJIS = ["🍛", "🍲", "🥘", "🍚", "🫓", "🥗", "🍳", "🍜", "🥙", "🍽️"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const METHODS = [...(Object.keys(METHOD_TEMP_C) as CookingMethod[]), "raw" as CookingMethod];

const KINDS: { value: CustomKind; label: string; hint: string }[] = [
  {
    value: "meal",
    label: "Complete meal",
    hint: "A full plate on its own, like dal and rice. Put the rice or chapati in the ingredients.",
  },
  {
    value: "dish",
    label: "Main dish",
    hint: "A curry or fry that needs rice or chapati. Pick what goes with it below.",
  },
  {
    value: "side",
    label: "Side",
    hint: "Rice, chapati, bread or a salad. Pair it with a main dish. The planner never picks a side alone.",
  },
];

const methodLabel = (m: CookingMethod) => (m === "raw" ? "No cooking" : humanize(m));

const BLANK: Omit<CustomFoodInput, "userId"> = {
  name: "",
  emoji: "🍛",
  kind: "dish",
  mealTypes: ["lunch", "dinner"],
  servings: 2,
  prepMin: 10,
  cookMin: 20,
  method: "saute",
  ingredients: [],
  howTo: "",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[13px] font-medium text-text-2">{children}</p>;
}

function StepperRow({
  label,
  ...rest
}: { label: string } & Omit<React.ComponentProps<typeof Stepper>, "label">) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[14px] text-text">{label}</span>
      <Stepper label={label} {...rest} />
    </div>
  );
}

function DeleteFoodSheet({
  open,
  onClose,
  name,
  upcoming,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  upcoming: number;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete this food?"
      description={
        upcoming > 0
          ? `It is in ${upcoming} planned meal${upcoming === 1 ? "" : "s"}. Those meals will be removed from your plan.`
          : "It will be removed from your recipes."
      }
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="danger" fullWidth size="lg" onClick={onConfirm}>
            Delete
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Keep it
          </Button>
        </div>
      }
    >
      <p className="text-[14px] text-text-2">{name || "This food"} can be added again later.</p>
    </Sheet>
  );
}

export interface CustomFoodFormProps {
  /** Present when editing a food that already exists. */
  initial?: CustomFoodInput;
  /** The saved food has more steps than the form can rebuild (a dish saved with its rice or chapati). */
  rebuildsSteps?: boolean;
}

/** Add or edit a food: name, ingredients with weights, timing and what it is served with. */
export function CustomFoodForm({ initial, rebuildsSteps }: CustomFoodFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(initial?.id);

  const recipes = useRecipeStore((s) => s.recipes);
  const plans = usePlanStore((s) => s.plans);
  const staples = useMemo(() => recipes.filter(isStaple), [recipes]);

  const start = initial ?? { ...BLANK, userId: "" };
  const [name, setName] = useState(start.name);
  const [emoji, setEmoji] = useState(start.emoji);
  const [kind, setKind] = useState<CustomKind>(start.kind);
  const [serveWithId, setServeWithId] = useState<ID>("");
  const [mealTypes, setMealTypes] = useState<MealType[]>(start.mealTypes);
  const [servings, setServings] = useState(start.servings);
  const [prepMin, setPrepMin] = useState(start.prepMin);
  const [cookMin, setCookMin] = useState(start.cookMin);
  const [method, setMethod] = useState<CookingMethod>(start.method);
  const [rows, setRows] = useState(start.ingredients);
  const [howTo, setHowTo] = useState(start.howTo ?? "");

  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const toInput = (userId: ID): CustomFoodInput => ({
    id: initial?.id,
    name,
    emoji,
    kind,
    mealTypes,
    servings,
    prepMin,
    cookMin: method === "raw" ? 0 : cookMin,
    method,
    ingredients: rows,
    howTo,
    serveWith:
      kind === "dish" && serveWithId
        ? staples.filter((s) => s.id === serveWithId)
        : undefined,
    userId,
  });

  const problems = validateCustomFood(toInput(""));
  const hasIngredients = rows.some((r) => r.grams > 0);
  const preview = useMemo(
    () => (hasIngredients ? buildCustomRecipe(toInput("preview"), INGREDIENTS) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, emoji, kind, serveWithId, mealTypes, servings, prepMin, cookMin, method, rows, hasIngredients, staples],
  );
  const carbs = preview?.nutritionPerServing.carbsG ?? 0;

  const toggleMealType = (m: MealType) =>
    setMealTypes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const toggleIngredient = (ingredient: Ingredient) =>
    setRows((cur) =>
      cur.some((r) => r.ingredientId === ingredient.id)
        ? cur.filter((r) => r.ingredientId !== ingredient.id)
        : [...cur, { ingredientId: ingredient.id, grams: defaultGrams(ingredient) }],
    );

  const setGrams = (ingredientId: ID, grams: number) =>
    setRows((cur) => cur.map((r) => (r.ingredientId === ingredientId ? { ...r, grams } : r)));

  const save = () => {
    if (problems.length > 0) {
      setShowErrors(true);
      return;
    }
    const recipe = buildCustomRecipe(toInput(useProfileStore.getState().userId()), INGREDIENTS);
    useRecipeStore.getState().upsert(recipe);
    toast({
      title: editing ? "Food updated" : "Food added",
      description: `${recipe.name} is ready to plan and cook.`,
      tone: "success",
    });
    router.replace("/foods");
  };

  const upcoming = initial?.id ? upcomingUses(plans, initial.id) : [];

  const remove = () => {
    if (!initial?.id) return;
    const plan = usePlanStore.getState();
    for (const mealId of upcoming) plan.removeMeal(mealId);
    useRecipeStore.getState().remove(initial.id);
    toast({ title: "Food deleted", tone: "success" });
    router.replace("/foods");
  };

  const kindHint = KINDS.find((k) => k.value === kind)?.hint;

  return (
    <>
      <AppHeader back="/foods" title={editing ? "Edit food" : "Add a food"} />
      <Page>
        <div className="flex flex-col gap-5">
          {rebuildsSteps && (
            <p className="text-xs text-text-3">
              Saving rebuilds the cooking steps from what is in this form. Add how you make it
              below to keep your own wording.
            </p>
          )}
          <Input
            label="Name"
            placeholder="Soya chunks curry"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            error={showErrors && !name.trim() ? "Give the food a name." : undefined}
          />

          <div>
            <Label>Picture</Label>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {EMOJIS.map((e) => (
                <Chip key={e} selected={emoji === e} onClick={() => setEmoji(e)} aria-label={`Use ${e}`}>
                  <span className="text-lg leading-none">{e}</span>
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>What is it?</Label>
            <SegmentedControl
              label="Kind of food"
              size="sm"
              value={kind}
              onChange={setKind}
              options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
            <p className="mt-1.5 text-xs text-text-3">{kindHint}</p>
          </div>

          {kind === "dish" && (
            <div>
              <Label>Serve with</Label>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                <Chip selected={serveWithId === ""} onClick={() => setServeWithId("")}>
                  Nothing yet
                </Chip>
                {staples.map((s) => (
                  <Chip
                    key={s.id}
                    selected={serveWithId === s.id}
                    onClick={() => setServeWithId(s.id)}
                  >
                    {s.emoji} {s.name}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-text-3">
                The rice or chapati is added to the ingredients, steps, time and nutrition.
              </p>
            </div>
          )}

          <div>
            <Label>Good for</Label>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((m) => (
                <Chip key={m} selected={mealTypes.includes(m)} onClick={() => toggleMealType(m)}>
                  {humanize(m)}
                </Chip>
              ))}
            </div>
            {showErrors && mealTypes.length === 0 && (
              <p className="mt-1.5 text-xs text-red-600">Pick at least one meal it suits.</p>
            )}
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 py-1">
            <StepperRow label="Servings" value={servings} onChange={setServings} min={1} max={12} />
            <StepperRow label="Prep time" value={prepMin} onChange={setPrepMin} min={0} max={120} step={5} unit="min" />
            <StepperRow
              label="Cook time"
              value={method === "raw" ? 0 : cookMin}
              onChange={setCookMin}
              min={0}
              max={180}
              step={5}
              unit="min"
              disabled={method === "raw"}
            />
          </div>

          <Select
            label="How is it cooked?"
            value={method}
            onChange={(e) => {
              const next = e.target.value as CookingMethod;
              setMethod(next);
              if (next === "raw") setCookMin(0);
              else if (cookMin === 0) setCookMin(20);
            }}
            options={METHODS.map((m) => ({ value: m, label: methodLabel(m) }))}
          />

          <section>
            <SectionHeader
              title="Ingredients"
              caption={rows.length ? `${rows.length} added, weights are for the whole dish` : undefined}
              right={
                <Button size="sm" variant="soft" leftIcon={<Plus size={16} />} onClick={() => setPicking(true)}>
                  Add
                </Button>
              }
            />
            {rows.length === 0 ? (
              <p
                className={`rounded-2xl border border-dashed px-4 py-5 text-center text-[13px] ${
                  showErrors ? "border-red-600 text-red-600" : "border-border text-text-3"
                }`}
              >
                Add each ingredient with its weight in grams.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {rows.map((row) => {
                  const ingredient = BY_ID.get(row.ingredientId);
                  if (!ingredient) return null;
                  return (
                    <li key={row.ingredientId} className="flex items-center gap-3 px-3 py-2">
                      <span aria-hidden="true" className="text-2xl">
                        {ingredient.emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">
                        {ingredient.name}
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        aria-label={`${ingredient.name} weight in grams`}
                        containerClassName="w-24"
                        value={row.grams === 0 ? "" : row.grams}
                        onChange={(e) => setGrams(row.ingredientId, Math.max(0, Number(e.target.value) || 0))}
                        rightSlot={<span className="text-xs text-text-3">g</span>}
                      />
                      <IconButton
                        aria-label={`Remove ${ingredient.name}`}
                        size={36}
                        onClick={() => setRows((cur) => cur.filter((r) => r.ingredientId !== row.ingredientId))}
                      >
                        <X size={18} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Textarea
            label="How do you make it? (optional)"
            placeholder="Fry the onion, add the soya chunks and spices, cover and cook."
            rows={4}
            value={howTo}
            onChange={(e) => setHowTo(e.target.value)}
          />

          {preview && (
            <Card tone="green" padding="sm">
              <p className="mb-2 text-[13px] font-semibold text-text">For one serving</p>
              <StatPillRow>
                <StatPill value={String(Math.round(preview.nutritionPerServing.kcal ?? 0))} unit="kcal" />
                <StatPill value={`${Math.round(preview.nutritionPerServing.proteinG ?? 0)}g`} unit="protein" />
                <StatPill value={`${Math.round(carbs)}g`} unit="carbs" />
                <StatPill value={`₹${Math.round(preview.costPerServing)}`} unit="cost" />
              </StatPillRow>
              {kind === "meal" && carbs < COMPLETE_MEAL_MIN_CARBS_G && (
                <p className="mt-2 text-xs text-orange-600">
                  Only {Math.round(carbs)} g of carbs. Add rice, flour or potato for a full plate.
                </p>
              )}
              {kind === "dish" && !serveWithId && (
                <p className="mt-2 text-xs text-orange-600">
                  No rice or chapati yet. Without one, the planner will not pick this alone for
                  lunch or dinner.
                </p>
              )}
            </Card>
          )}

          {showErrors && problems.length > 0 && (
            <Card tone="orange" padding="sm">
              <ul className="list-disc pl-5 text-[13px] text-text">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          )}

          {editing && initial?.id && (
            <div className="flex flex-col gap-2">
              <Button variant="secondary" fullWidth href={routes.recipe(initial.id)}>
                View recipe
              </Button>
              <Button
                variant="danger"
                fullWidth
                leftIcon={<Trash2 size={16} />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete this food
              </Button>
            </div>
          )}
        </div>
      </Page>

      <StickyFooter withNav>
        <Button fullWidth size="lg" onClick={save}>
          {editing ? "Save changes" : "Save food"}
        </Button>
      </StickyFooter>

      <IngredientPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        ingredients={INGREDIENTS}
        selected={rows.map((r) => r.ingredientId)}
        onToggle={toggleIngredient}
      />

      {editing && (
        <DeleteFoodSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          name={name}
          upcoming={upcoming.length}
          onConfirm={remove}
        />
      )}
    </>
  );
}
