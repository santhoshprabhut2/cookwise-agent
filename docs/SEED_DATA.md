# Cookwise — Seed Data (ingredients & recipes)

Catalog owned by `src/lib/data/seed/ingredients.ts` (77 ingredients) and
`src/lib/data/seed/recipes.ts` (41 core recipes plus 21 complete meals built from them, 62 in
all). Both are plain data modules that match
`src/lib/types.ts` exactly; `src/lib/data/seed/__tests__/seed.test.ts` guards every rule below.
Run `npx vitest run src/lib/data/seed`.

---

## How the numbers were produced

**Ingredient nutrition** — per 100 g of the **raw, edible portion** (per 100 ml for milk and the
oils), taken from IFCT 2017 where an Indian value exists (ragi, urad/toor/moong/chana dal, curry
leaves, drumstick, poha, jaggery, paneer, coconut) and USDA SR-28 typical values otherwise (egg,
chicken, fish, prawns, oats, pasta, cheese). `kcal`, `proteinG`, `carbsG`, `fatG`, `fiberG` are
always present. The micronutrients the retention engine weights — `vitaminCMg`, `vitaminB6Mg`,
`folateUg`, `vitaminAUg`, `ironMg`, `calciumMg`, `potassiumMg` — are filled in wherever they are
meaningful (all vegetables, fruit, legumes, dairy, meat) and omitted where they are noise (refined
oils, sugar). `carbsG` is total carbohydrate **including** fibre, so `4·protein + 4·carbs + 9·fat`
runs a little above the listed kcal for very high-fibre items; that is expected.

**Cost** — Chennai retail rupees per kg (per litre for `ml` ingredients), 2026 prices:
tomato 40, onion 35, potato 35, egg 140 (≈ ₹7/piece), chicken 260, fish 500, prawns 600,
paneer 420, milk 60/L, rice 60, basmati 120, ghee 700, sunflower oil 150, olive oil 900.

**Recipe nutrition** — `nutritionPerServing` is **computed** from the ingredient list:
`Σ(grams / 100 × nutrient per 100 g) ÷ servings`, then rounded. For the seven mockup recipes the
result is scaled by a single factor so the card prints the exact kcal the mockup shows; every one of
them lands within 3 % of its computed value except Egg Bhurji (see deviations).

**Recipe cost** — `Σ(grams / 1000 × costPerKg) ÷ servings`, rounded to whole rupees.

**Steps** — 4–8 per recipe, ids `"<recipe-id>-s<n>"`, `order` starting at 1. Every ingredient is
introduced by exactly the steps that use it, and the `addIngredients` grams across all steps sum to
the recipe's `grams` for that ingredient (tolerance ±5 g) so the scale dock can verify each
addition. Heat steps carry `method`, `durationSec` and a `targetTempC` window appropriate to the
method (saute 100–180, stir_fry 150–210, shallow_fry 145–200, simmer 85–105, boil/steam 95–105,
pressure_cook 110–125, grill 170–240); `raw` steps carry no temperature. `stateCue` gives the
cooking screen (and the vision check) something to look for; `tip` carries the nutrient-retention
advice that the retention screen echoes.

**Known deviations**

- `egg-bhurji` — the mockup shows 4 eggs (200 g) for 2 servings alongside a 320 kcal / 24 g
  protein panel, which cannot both be true (4 eggs compute to ~244 kcal / ~14 g). During integration
  the recipe was changed to **6 eggs (300 g)** so the panel is derived like every other recipe:
  316 kcal / 20.4 g protein / 9.4 g carbs / 21.8 g fat / 2 g fibre per serving, ₹28 per serving.
  This keeps the recipe card and the scale-measured "what you actually cooked" card consistent.
- `imageUrl` is omitted everywhere — screens render the emoji-on-gradient tile described in
  `docs/ARCHITECTURE.md` §3.

---

## Ingredient ids (77)

- **vegetables (24)** — `tomato`, `onion`, `spinach`, `green-chilli`, `potato`, `carrot`,
  `capsicum`, `garlic`, `ginger`, `coriander-leaves`, `curry-leaves`, `peas`, `beans`, `cabbage`,
  `cauliflower`, `brinjal`, `drumstick`, `mint-leaves`, `cucumber`, `beetroot`, `spring-onion`,
  `sweet-corn`, `broccoli`, `sweet-potato`
- **fruits (2)** — `banana`, `lemon`
- **proteins (6)** — `egg`, `chicken`, `fish`, `prawns`, `soya-chunks`, `tofu`
- **legumes (7)** — `urad-dal`, `toor-dal`, `moong-dal`, `chana-dal`, `chickpeas`, `rajma`,
  `moong-sprouts`
- **grains (9)** — `rice`, `basmati-rice`, `ragi-flour`, `wheat-flour`, `semolina`, `poha`, `oats`,
  `pasta`, `bread`
- **dairy (5)** — `milk`, `curd`, `paneer`, `butter`, `cheese`
- **oils (4)** — `sunflower-oil`, `ghee`, `coconut-oil`, `olive-oil`
- **nuts (3)** — `coconut`, `peanuts`, `cashews`
- **spices (13)** — `salt`, `turmeric`, `red-chilli-powder`, `coriander-powder`, `garam-masala`,
  `sambar-powder`, `cumin-seeds`, `mustard-seeds`, `black-pepper`, `dry-red-chilli`, `asafoetida`,
  `bay-leaf`, `cinnamon`
- **other (4)** — `tamarind`, `sugar`, `jaggery`, `honey`

Sold by the piece (`defaultUnit: "pcs"` with `gramsPerPiece`): `egg` 50 g, `onion` 100 g,
`tomato` 100 g, `potato` 100 g, `capsicum` 120 g, `banana` 120 g, `lemon` 60 g, `coconut` 400 g,
`green-chilli` 5 g. Measured in `ml`: `milk`, `sunflower-oil`, `coconut-oil`, `olive-oil`.
Everything else is `g`. Each entry carries Tamil/Hindi `aliases` ("thakkali", "vengayam", "muttai",
"keerai", "pyaaz", "paal", "arisi", …) so the ingredient search and the Gemini identify/receipt
matchers can hit them.

## Core recipe ids (41)

| id | name | meals | min | serves | method | kcal/serving | ₹/serving |
|---|---|---|---|---|---|---|---|
| `egg-bhurji` | Egg Bhurji | breakfast, dinner | 20 | 2 | saute | 316 | 28 |
| `ragi-dosa` | Ragi Dosa | breakfast | 20 | 2 | shallow_fry | 450 | 12 |
| `chicken-biryani` | Chicken Biryani | lunch, dinner | 40 | 4 | pressure_cook | 620 | 62 |
| `tomato-egg-curry` | Tomato Egg Curry | lunch, dinner | 20 | 2 | simmer | 380 | 30 |
| `spinach-chicken-stir-fry` | Spinach Chicken Stir Fry | lunch, dinner | 25 | 2 | stir_fry | 420 | 59 |
| `veg-upma` | Veg Upma | breakfast, snack | 15 | 2 | saute | 310 | 14 |
| `tomato-pasta` | Tomato Pasta | lunch, dinner | 20 | 2 | simmer | 400 | 36 |
| `idli-sambar` | Idli Sambar | breakfast, dinner | 45 | 2 | steam | 489 | 24 |
| `poha` | Poha | breakfast, snack | 15 | 2 | saute | 384 | 12 |
| `oats-porridge` | Oats Porridge | breakfast | 10 | 2 | simmer | 368 | 31 |
| `masala-omelette` | Masala Omelette | breakfast, snack | 10 | 2 | shallow_fry | 217 | 19 |
| `paneer-bhurji` | Paneer Bhurji | breakfast, dinner | 20 | 2 | saute | 388 | 53 |
| `dal-tadka` | Dal Tadka | lunch, dinner | 30 | 4 | pressure_cook | 252 | 17 |
| `rajma-masala` | Rajma Masala | lunch, dinner | 45 | 4 | pressure_cook | 268 | 16 |
| `chana-masala` | Chana Masala | lunch, dinner | 40 | 4 | simmer | 285 | 14 |
| `palak-paneer` | Palak Paneer | lunch, dinner | 35 | 4 | simmer | 294 | 42 |
| `vegetable-pulao` | Vegetable Pulao | lunch, dinner | 35 | 4 | pressure_cook | 361 | 26 |
| `curd-rice` | Curd Rice | lunch, dinner | 20 | 2 | boil | 379 | 22 |
| `lemon-rice` | Lemon Rice | lunch, snack | 20 | 2 | saute | 398 | 12 |
| `fish-curry` | Fish Curry | lunch, dinner | 40 | 4 | simmer | 302 | 73 |
| `prawn-masala` | Prawn Masala | lunch, dinner | 25 | 2 | saute | 307 | 103 |
| `chicken-curry` | Chicken Curry | lunch, dinner | 45 | 4 | simmer | 347 | 49 |
| `grilled-chicken-salad` | Grilled Chicken Salad | lunch, dinner | 30 | 2 | grill | 363 | 61 |
| `soya-chunk-curry` | Soya Chunk Curry | lunch, dinner | 35 | 4 | simmer | 204 | 16 |
| `tofu-stir-fry` | Tofu Stir Fry | lunch, dinner | 20 | 2 | stir_fry | 324 | 70 |
| `moong-dal-khichdi` | Moong Dal Khichdi | lunch, dinner | 25 | 2 | pressure_cook | 388 | 19 |
| `rasam-rice` | Rasam Rice | lunch, dinner | 30 | 2 | simmer | 388 | 21 |
| `cabbage-poriyal` | Cabbage Poriyal | lunch, dinner | 20 | 4 | saute | 131 | 7 |
| `aloo-gobi` | Aloo Gobi | lunch, dinner | 40 | 4 | saute | 178 | 13 |
| `banana-oat-smoothie` | Banana Oat Smoothie | snack, breakfast | 5 | 2 | raw | 324 | 30 |
| `sprouts-salad` | Sprouts Salad | snack | 10 | 2 | raw | 132 | 21 |
| `vegetable-soup` | Vegetable Soup | dinner, snack | 25 | 2 | boil | 155 | 18 |
| `steamed-broccoli` | Steamed Broccoli with Lemon & Pepper | lunch, dinner, snack | 9 | 2 | steam | 79 | 32 |
| `steamed-carrot-beans` | Steamed Carrot & Beans | lunch, dinner, snack | 10 | 2 | steam | 82 | 16 |
| `steamed-veg-egg-plate` | Steamed Veg & Boiled Egg Plate | lunch, dinner | 15 | 2 | steam | 230 | 40 |
| `banana-curd-bowl` | Banana Curd Bowl | breakfast, snack | 4 | 2 | raw | 284 | 32 |
| `steamed-sweet-potato` | Steamed Sweet Potato Chaat | breakfast, lunch, snack | 22 | 2 | steam | 235 | 20 |
| `steamed-corn-chaat` | Steamed Corn Chaat | lunch, dinner, snack | 14 | 2 | steam | 150 | 22 |
| `egg-veg-sandwich` | Egg & Veg Sandwich | breakfast, lunch, dinner | 10 | 2 | shallow_fry | 358 | 31 |
| `steamed-rice` | Steamed Rice | lunch, dinner | 28 | 2 | simmer | 345 | 8 |
| `chapati` | Chapati | lunch, dinner | 29 | 2 | roast | 347 | 6 |

The last two are **staples** (tag `staple`). They exist to be eaten with a main dish and are never
planned or recommended on their own; see Complete meals below.

The last seven are the **simple dishes**: every one is `easy`, has six ingredients or fewer
besides seasoning, and finishes in 22 minutes or less (the steamed ones need one pot and a
lid). They give the planner something to offer a slot that only allows 10 or 20 minutes.
Steaming also keeps more vitamin C than boiling, which is what the retention engine models.

**Cook-once dishes** — nine long, reheat-friendly recipes carry the `batch_friendly` tag
(`rajma-masala`, `chana-masala`, `dal-tadka`, `chicken-curry`, `chicken-biryani`,
`soya-chunk-curry`, `palak-paneer`, `vegetable-pulao`, `aloo-gobi`). The planner may cook one of
these once and serve it at the next lunch or dinner as a leftover; see ENGINES.md. Fish and
prawns are deliberately left untagged because they are best eaten the day they are cooked.

## Complete meals (21 built, 30 for lunch and dinner)

A curry is a dish, not a lunch. `src/lib/data/seed/meals.ts` lists 21 pairings of a main dish
with the rice or chapati it is eaten with (and, for the two thalis, a vegetable side).
`buildCompleteMeals` runs `composeMeal` over them when the catalog loads, so each meal is exactly
its parts: ingredients merged, nutrition and cost summed, steps joined, and a change to the dal
recipe flows into every plate with dal on it. Each is tagged `complete_meal` and takes lunch and
dinner unless noted.

| id | name | main + with |
|---|---|---|
| `rajma-chawal` | Rajma Chawal | Rajma Masala + Steamed Rice |
| `dal-rice` | Dal Tadka with Rice | Dal Tadka + Steamed Rice |
| `chana-masala-rice` | Chana Masala with Rice | Chana Masala + Steamed Rice |
| `soya-curry-rice` | Soya Chunk Curry with Rice | Soya Chunk Curry + Steamed Rice |
| `chicken-curry-rice` | Chicken Curry with Rice | Chicken Curry + Steamed Rice |
| `fish-curry-rice` | Fish Curry with Rice | Fish Curry + Steamed Rice |
| `egg-curry-rice` | Tomato Egg Curry with Rice | Tomato Egg Curry + Steamed Rice |
| `prawn-masala-rice` | Prawn Masala with Rice | Prawn Masala + Steamed Rice |
| `tofu-stir-fry-rice` | Tofu Stir Fry with Rice | Tofu Stir Fry + Steamed Rice |
| `spinach-chicken-rice` | Spinach Chicken Stir Fry with Rice | Spinach Chicken Stir Fry + Steamed Rice |
| `egg-veg-plate-rice` | Steamed Veg and Egg Plate with Rice | Steamed Veg & Boiled Egg Plate + Steamed Rice |
| `chana-masala-chapati` | Chana Masala with Chapati | Chana Masala + Chapati |
| `soya-curry-chapati` | Soya Chunk Curry with Chapati | Soya Chunk Curry + Chapati |
| `chicken-curry-chapati` | Chicken Curry with Chapati | Chicken Curry + Chapati |
| `egg-curry-chapati` | Tomato Egg Curry with Chapati | Tomato Egg Curry + Chapati |
| `palak-paneer-chapati` | Palak Paneer with Chapati | Palak Paneer + Chapati |
| `aloo-gobi-chapati` | Aloo Gobi with Chapati | Aloo Gobi + Chapati |
| `egg-bhurji-chapati` | Egg Bhurji with Chapati (breakfast, dinner) | Egg Bhurji + Chapati |
| `paneer-bhurji-chapati` | Paneer Bhurji with Chapati (breakfast, dinner) | Paneer Bhurji + Chapati |
| `dal-chapati-thali` | Dal Chapati Thali with Cabbage Poriyal | Dal Tadka + Chapati + Cabbage Poriyal |
| `dal-rice-sabzi-thali` | Dal Rice Thali with Aloo Gobi | Dal Tadka + Steamed Rice + Aloo Gobi |

**Already whole plates** — nine core recipes carry the carb in the dish itself (50 g or more per
serving) and count as complete without a pairing: Chicken Biryani, Vegetable Pulao, Curd Rice,
Lemon Rice, Rasam Rice, Moong Dal Khichdi, Idli Sambar, Tomato Pasta and Egg & Veg Sandwich.
With the 21 above that makes **30 plates for lunch and dinner**. The Complete meals screen
(`/meals`) lists them with filters.

**Rules** — `isCompleteMeal` is true for the tag or for 50 g of carbs a serving; `isStaple` meals
are never complete on their own. A plate gets rice first (it simmers unattended, so it adds no
time) and chapati last (it needs hands and a hot tawa, so its time is added). Chapati plates
therefore take 25 to 30 minutes longer than the same curry with rice.

**Coverage** (the 41 core recipes) — `primaryMethod` spread: simmer 10, saute 8, steam 6,
pressure_cook 5, shallow_fry 3, raw 3, stir_fry 2, boil 2, grill 1, roast 1 (the retention model
keys off this field). 18 vegan recipes; 12 carry a `snack` meal type; 12 finish in ≤ 15 minutes
and 8 in ≤ 10; spice levels span 1–4; cost per serving spans ₹6–₹103.

**Diet convention** — `diets` lists every diet the recipe is *compatible with*, widest first:
vegan dishes list all five, dairy-vegetarian dishes list all but `vegan`, egg dishes list
`eggetarian` + `non_vegetarian`, seafood lists `pescatarian` + `non_vegetarian`, and chicken lists
`non_vegetarian` only. The planner can therefore hard-filter with a simple `diets.includes(profile.diet)`.
