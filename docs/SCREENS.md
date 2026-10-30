# Cookwise — Screen Specifications (from the reference mockups)

All screens are portrait phone layouts (390–430 px wide). Status bar and home indicator are the OS's;
do not draw them. Use tokens from `globals.css`. Component names refer to `src/components/ui`.

---

## 1. Splash — `/`
- Ground `bg-bg` with a faint decorative food illustration in the corners (CSS radial gradients in
  green-50/orange-50; no images).
- Centre: leaf logo (lucide `Leaf` inside a rounded green tile, or an inline SVG two-leaf mark in `text-primary`)
  above the wordmark **cookwise** (lowercase, 40px, font-extrabold, `text-primary`), tagline
  "Cook Smarter. Live Healthier." (`text-text-2`).
- Paragraph: "Your personal cooking companion that measures, guides and adapts." centred, 15px, `text-text-2`.
- Four feature rows, left aligned, each: 36px outlined square icon (`border-border rounded-xl`) + label:
  "Track what you cook" (`ClipboardList`), "Get personalized meals" (`Sparkles`), "Preserve nutrients" (`Leaf`),
  "Reduce food waste" (`Recycle`).
- Bottom: full-width primary pill **Get Started →**. If the profile is already onboarded, redirect to `/home`.

## 2. Onboarding — `/onboarding` (7 steps, one screen each, progress dots on top)
1. **About you** — name, age, city, gender (optional), height/weight (optional).
2. **Diet** — diet type cards (Vegetarian, Non-vegetarian, Eggetarian, Vegan, Pescatarian); allergies chips
   (Nuts, Dairy, Gluten, Shellfish, Soy, Eggs) multi-select; restrictions chips (No onion/garlic, Low sodium, Gluten free).
3. **Goals** — goal cards (Muscle gain, Weight loss, Maintenance, Improve energy, Balanced) multi-select is NOT allowed
   (single); show a computed daily kcal + protein target (Mifflin-St Jeor with a goal modifier) the user can override.
4. **Kitchen** — equipment chips (Stove, Oven, Microwave, Pressure cooker, Mixer, Blender, Air fryer, Frying pan,
   Kadai, Dosa pan, Tawa, Steamer, Rice cooker, Sensor dock).
5. **Taste** — cuisines chips (South Indian, North Indian, Continental, Chinese, Mediterranean), spice level
   slider 1–5 with emoji, favourite foods free-text chips, disliked ingredients (search the catalog).
6. **Budget & time** — monthly budget (INR) with quick chips (₹3,000 / ₹5,000 / ₹8,000 / ₹12,000),
   cooking skill (Beginner / Intermediate / Advanced), time availability (Low / Medium / High / Varies by day),
   default servings stepper.
7. **Priorities** — drag-to-rank list (or tap to order) of Nutrition, Time, Budget, Taste, Waste reduction;
   final **Finish →** completes onboarding, seeds the first week's plan and navigates to `/home`.
- Footer on every step: outline **Back** + primary **Next →**; validation messages inline.

## 3. Home — `/home`
- Header (no back): small `text-primary` "Good morning," then 26px bold "**Santhosh** ☀️" (emoji by time of day),
  caption "Ready to cook something amazing?". Right: bell icon button with a red dot when there are expiring items.
- **Today's Meal card**: label "Today's Meal", chip "High Protein" (first tag), 22px bold recipe name,
  emoji/image tile on the right (88×88, rounded-xl) with a 36px green circular arrow button overlapping its corner.
  Below: 3 StatPills: `Clock` 20 min · `Flame` 320 kcal · `Dumbbell` 24g protein. Tap → `/recipes/view?id=`.
  Picks the next uncooked meal today (breakfast → lunch → dinner) from the current plan.
- **Quick actions** 4-column grid of white tiles (icon square 40px tinted + 2-line 11px label):
  Scan Ingredients (orange, `Camera`) → `/pantry/add?mode=scan`; View Meal Plan (blue, `CalendarDays`) → `/plan`;
  Start Cooking (green, `CookingPot`) → `/cook`; Add to Pantry (green, `Plus`) → `/pantry/add`.
- **Pantry Alerts card**: title, orange caption "3 items expiring soon", "See all" link → `/expiring`.
  Row of up to 3 mini tiles (emoji 28px, name, orange "2 days").
- **Stay on track card**: leaf icon tile, "Your weekly goal: **Muscle gain**", "**1,850** / 2,500 kcal" from
  today's cooked meals vs `dailyCalorieTarget`, green ProgressBar; small bar-chart icon on the right.
- BottomNav (Home active).

## 4. Weekly Plan — `/plan`
- Header: back, "Weekly Plan".
- Week switcher: `<` "Aug 25 – Aug 31" `>` centred, `text-primary` for the range.
- Day strip: 7 squares (Mon…Sun with day number); selected day is a filled `bg-primary` square with white text.
- For the selected day, meal cards (image tile 64px left; grey label "Breakfast"; bold name; "450 kcal • 20 min";
  lock icon toggles `locked`; kebab → Swap / Edit servings / Mark eaten out / Remove). Cooked meals show a green check.
- Bottom: outline **+ Add / Swap Meal** (opens a Sheet with a searchable recipe list filtered by meal type), and
  a row of two secondary actions: **Grocery list** → `/plan/grocery`, **Plans changed?** → `/plan/adapt`.
- Empty state (no plan): illustration + primary **Generate my week** (calls `usePlanStore.generate`).

## 5. Grocery — `/plan/grocery`
- Header back, "Grocery List", right: "Regenerate".
- Summary card: items count, estimated total (₹), "covers Aug 25 – Aug 31".
- Grouped by category; each row: checkbox (purchased), emoji, name, quantity, ₹ estimate.
- Sticky bottom primary **Add purchased to pantry** (moves checked items → pantry with default expiry).

## 6. Adapt — `/plan/adapt`
- Header back, "Plans changed?".
- Chooser cards: Less time today (`Timer`), Guests coming (`Users`), Eating out (`UtensilsCrossed`),
  Change of mood (`Smile`), Skip a meal (`X`). Each expands inline inputs (date, meal, minutes / guest count / mood chips).
- Primary **Re-optimise my week** → shows a diff list "Dinner: Chicken Biryani → Veg Upma (15 min)" with Apply.

## 7. Cook tab — `/cook`
- Header "Cook" (no back). Sections: **Today** (plan meals as horizontal cards with "Start"), **Use expiring items**
  (compact banner → `/expiring`), **Recommended for you** (learning engine), **All recipes** with search + chips
  (All, Breakfast, Lunch, Dinner, Quick, High protein).

## 8. Recipe detail — `/recipes/view?id=` (ids moved from the path to the query so the site can be a static export, see PAGES.md)
- Hero 240px: image or gradient+emoji; back and heart buttons (40px white circles) overlaid; chip "High Protein" bottom-left.
- Content card overlapping the hero (rounded-t-3xl): 24px bold title, caption, 3 StatPills.
- "Nutrition (per serving)" 4 tiles: 24g Protein · 12g Carbs · 18g Fats · 5g Fiber.
- "Ingredients (2 servings)" with a servings stepper; right: soft green button **Add to Pantry** (adds missing items to grocery list).
  Rows: emoji tile, name, "4 pcs (200 g)", trailing check circle green when the pantry has enough (`totalGrams ≥ grams`).
- Steps preview (collapsed list). Sticky bottom primary **Start Cooking →** → `useCookStore.start` → `/cook/session?id=`.

## 9. Cooking Mode — `/cook/session?id=`
Phase A — **Verify ingredients** (one card per ingredient): "Place Eggs on the dock", live weight readout
(48px bold "100.2 g" pulsing while unstable), target "200 g", tolerance ±10 %; camera button → `/api/ai/identify`
(shows "Identified: Onion 94 %"); **Confirm** logs an `IngredientLog`. Skip → manual entry. Progress "3 of 4 verified".
Phase B — **Steps**: header back "Cooking Mode"; "Step 2 of 6" + thin ProgressBar; 22px title; instruction.
If the step has `addIngredients`: live camera/dock card (dark rounded image area with badge "● Live from sensor dock"
top-left, big weight "100.2 g" bottom-left, green check circle bottom-right) and chip "✓ Perfect amount!" /
"Add 20 g more" / "20 g over — that's fine" beneath. If the step has `targetTempC`: **Pan Temperature** card
(flame icon, "Medium (140°C)", chip "Good range" / orange "Too hot") and a green-tinted note
"Keep temperature between 120°C – 150°C for better nutrient retention." (from `liveRetentionHint`).
If `durationSec`: timer ring with Start/Pause. Footer: outline **← Back** + primary **Next →**;
last step → **Finish cooking** → `complete()` → `/cook/session/retention?id=`.
A simulator control (small "Dock: simulate" sheet) lets the user add weight / change burner level for demos.

## 10. Nutrient Retention — `/cook/session/retention?id=`
- Header back, "Nutrient Retention".
- Card **Cooking Impact**: green icon tile, caption "Estimated nutrient retention based on your cooking method, temperature and time."
- Rows: label left, percent right (orange when < 60 %), ProgressBar, caption note. Order: Vitamin C, Vitamin B6, Folate,
  Protein, Fats (healthy), Iron … (hide nutrients the recipe barely contains).
- Warnings list (orange tint) then **Tip** card (leaf icon) "Cooking at medium heat helps retain more vitamins. Avoid overcooking."
- Bottom primary **Rate this meal →** → feedback.

## 11. Feedback — `/cook/session/feedback?id=`
- Header "How was it?" with recipe emoji. Overall 5-star; Taste 5-star; Spice segmented (Too mild / Just right / Too hot);
  Texture segmented; Quantity segmented; Notes textarea. Primary **Save feedback** → learning engine → toast
  "Thanks! We'll adjust your future plans." → `/home`.

## 12. Pantry — `/pantry`
- Header back, "My Pantry". Search field (`Search` icon, "Search ingredients…"). Filter chips: All (active dark),
  Vegetables, Proteins, Grains, Dairy, Spices, Other.
- Rows: 44px emoji tile, name (15px semibold), quantity caption ("500 g", "1 kg", "6 pcs"), expiry chip
  (orange "2 days" ≤ 2, amber "3 days" ≤ 4, green "7 days", grey "> 30 days"), kebab → Edit / Use it (→ `/expiring`) / Remove.
- FAB bottom-right (above nav) primary pill **+ Add Item** → `/pantry/add`.

## 13. Add to Pantry — `/pantry/add?mode=scan|dock|receipt|manual`
- Segmented control on top: **Scan** (camera + Gemini identify), **Dock** (camera + scale), **Receipt**, **Manual**.
- Scan: camera preview (`getUserMedia`, environment) with capture; result sheet "Tomato · 94 %" + alternatives,
  quantity input pre-filled with `estimatedGrams`, expiry defaulted from `shelfLifeDays`. **Add**.
- Dock: same identify plus live weight from `SensorDock`; cross-check message "Camera says Onion, scale reads 1,020 g".
- Receipt: capture → `/api/ai/receipt` → editable table → **Add all**.
- Manual: ingredient search (catalog), quantity + unit, expiry date, storage. **Add**.

## 14. Use Expiring Items — `/expiring`
- Header back, "Use Expiring Items".
- Orange banner with `Info` icon: "You have **3** ingredients expiring soon. Here are some recipe suggestions:" and chips of the items.
- Recipe rows: image tile 64px, bold name, orange caption "Uses 2 expiring items", grey "20 min • 380 kcal", chevron → recipe.
  Sorted by number of expiring items used, then time. Primary **View More Recipes** loads more.
- Bottom note tracking: "Used 4 of 6 expiring items this month" (from cook sessions).

## 15. Profile — `/profile`, `/profile/edit`
- Header "Profile" + gear (→ settings sheet: Sign in / Sync status / Reset demo data / About).
- Avatar 64px (initial letter tile if no photo), name 18px bold, "20 years • Chennai, India", soft green chip **✎ Edit Profile**.
- Card with rows (icon 36px tile + label 12px grey + value 14px): Goal, Diet, Budget "< ₹5,000 / month",
  Cooking Skill, Time Available, Spice Preference "Level 2", Favorite Foods, Equipment.
- `/profile/edit` reuses the onboarding step components in a tabbed form.
