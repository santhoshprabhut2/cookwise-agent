"""Tool layer for the Smart Cooking Assistant agent.

Every public function in this module is exposed to the LLM through OpenAI
function calling (see main.py) and returns a plain string, which is handed
straight back to the model as a tool result.

Nothing here calls the LLM - the tools are deterministic and testable offline,
which is why test_tools.py can validate the whole layer without an API key.

Ingredient matching is deliberately heuristic: pantry items and recipe
ingredients are compared by normalised name (with a small synonym map), not by
exact string equality, so "2 Tomatoes" in the pantry satisfies a recipe that
asks for 1 tomato. Quantities are only compared when the units match.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "cooking_assistant.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")

# Allergen groups -> trigger words found in ingredient names.
ALLERGEN_KEYWORDS: Dict[str, set] = {
    "dairy": {"milk", "paneer", "curd", "yogurt", "yoghurt", "cheese", "butter", "ghee", "cream"},
    "egg": {"egg", "eggs", "omelette"},
    "gluten": {"wheat", "flour", "bread", "pasta", "semolina", "maida", "noodles", "roti", "paratha"},
    "nuts": {"peanut", "peanuts", "almond", "cashew", "walnut", "pistachio", "nut"},
    "soy": {"soy", "tofu", "soya"},
    "fish": {"fish", "prawn", "shrimp", "salmon", "tuna", "crab"},
    "meat": {"chicken", "mutton", "beef", "pork", "lamb", "meat", "ham", "bacon"},
}

# Diet -> allergen groups that must not appear in the recipe.
# "vegetarian" excludes egg on purpose, because "eggetarian" exists as the
# permissive middle ground between vegetarian and non-veg.
DIET_EXCLUDES: Dict[str, set] = {
    "vegan": {"meat", "fish", "egg", "dairy"},
    "vegetarian": {"meat", "fish", "egg"},
    "eggetarian": {"meat", "fish"},
    "no_restriction": set(),
}

# Free-text allergy phrasings -> allergen group. Anything unmapped is used as a
# literal keyword against ingredient names.
_ALLERGY_ALIASES = {
    "lactose": "dairy", "milk": "dairy", "cheese": "dairy", "lactose intolerant": "dairy",
    "peanut": "nuts", "peanuts": "nuts", "nut": "nuts", "nuts": "nuts",
    "tree nuts": "nuts", "almond": "nuts", "cashew": "nuts",
    "wheat": "gluten", "gluten intolerance": "gluten", "celiac": "gluten",
    "shellfish": "fish", "seafood": "fish", "prawn": "fish", "prawns": "fish",
    "soya": "soy", "soybean": "soy",
    "chicken": "meat", "red meat": "meat", "pork": "meat", "beef": "meat",
}

_SYNONYMS = {
    "tomatoes": "tomato",
    "potatoes": "potato",
    "onions": "onion",
    "eggs": "egg",
    "carrots": "carrot",
    "chillies": "chilli",
    "chilies": "chilli",
    "bell pepper": "capsicum",
    "yoghurt": "curd",
    "yogurt": "curd",
    "dahi": "curd",
    "cilantro": "coriander",
    "coriander leaves": "coriander",
    "spring onions": "spring onion",
    "atta": "wheat flour",
    "chana": "chickpeas",
    "chole": "chickpeas",
    "chicken breasts": "chicken breast",
}

# Modifiers that should not be treated as the distinguishing word of an ingredient.
_STOPWORDS = {
    "green", "red", "fresh", "dry", "large", "small", "chopped", "cooked",
    "boiled", "raw", "ripe", "whole", "ground", "powder", "wholewheat",
}


# ---------------------------------------------------------------------------
# connection / setup
# ---------------------------------------------------------------------------
def db_path() -> str:
    """Active database path. Override with COOKING_DB (used by the tests)."""
    return os.environ.get("COOKING_DB") or DEFAULT_DB_PATH


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(seed: bool = True) -> str:
    """Create the tables and (optionally) load the shared recipes."""
    conn = get_conn()
    try:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as fh:
            conn.executescript(fh.read())
        conn.commit()
        if seed:
            import seed_recipes

            seed_recipes.seed(conn)
    finally:
        conn.close()
    return db_path()


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------
def _today() -> date:
    return date.today()


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y", "%d %b %Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


def _norm(text: Any) -> str:
    cleaned = re.sub(r"[^a-z0-9 ]", " ", str(text).lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return _SYNONYMS.get(cleaned, cleaned)


def _tokens(text: Any) -> set:
    return {t for t in _norm(text).split() if len(t) > 2 and t not in _STOPWORDS}


def _same_ingredient(a: Any, b: Any) -> bool:
    """True when two ingredient names should be treated as the same thing."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    return bool(_tokens(a) & _tokens(b))


def _fmt_qty(value: Any) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)
    return str(int(num)) if num.is_integer() else f"{num:g}"


def _loads(value: Any, fallback: Any) -> Any:
    if value is None or value == "":
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _week_start(value: Any = None) -> str:
    """Monday of the week containing `value` (defaults to today)."""
    parsed = _parse_date(value) or _today()
    return (parsed - timedelta(days=parsed.weekday())).isoformat()


def _ensure_user(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO users (id, name, diet, fitness_goal) VALUES (?, ?, ?, ?)",
        (user_id, f"User {user_id}", "non-veg", "maintain weight"),
    )


def _get_user(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    _ensure_user(conn, user_id)
    conn.commit()
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def _diet_excludes(diet: str) -> set:
    """Map a free-text diet to the allergen groups it forbids.

    Order matters: 'non-veg' contains 'veg', so it has to short-circuit before
    any substring test for vegetarian.
    """
    text = (diet or "").strip().lower().replace("_", "-")
    if not text:
        return set()
    if any(token in text for token in ("non-veg", "nonveg", "omnivore", "everything", "none", "no restriction")):
        return set()
    if "vegan" in text:
        return set(DIET_EXCLUDES["vegan"])
    if "egg" in text:  # eggetarian
        return set(DIET_EXCLUDES["eggetarian"])
    if "veg" in text:
        return set(DIET_EXCLUDES["vegetarian"])
    return set()


def _allergy_groups(allergies: str) -> set:
    """Turn free text like 'peanuts, dairy' into allergen group names."""
    groups: set = set()
    if not allergies:
        return groups
    parts = re.split(r"[,;/]| and ", str(allergies).lower())
    for part in parts:
        term = part.strip()
        if not term:
            continue
        if term in _ALLERGY_ALIASES:
            groups.add(_ALLERGY_ALIASES[term])
            continue
        singular = term[:-1] if term.endswith("s") and len(term) > 3 else term
        if singular in _ALLERGY_ALIASES:
            groups.add(_ALLERGY_ALIASES[singular])
            continue
        matched = False
        for group, words in ALLERGEN_KEYWORDS.items():
            if term == group or term in words or (singular == group):
                groups.add(group)
                matched = True
        if not matched:
            groups.add(term)  # treat unknown allergies as a literal keyword
    return groups


def _recipe_allergen_groups(ingredients: Sequence[Dict[str, Any]]) -> set:
    groups: set = set()
    for ing in ingredients:
        name = _norm(ing.get("item", ""))
        words = set(name.split())
        for group, keywords in ALLERGEN_KEYWORDS.items():
            if words & keywords or any(k in name for k in keywords):
                groups.add(group)
    return groups


def _blocks_recipe(user: sqlite3.Row, ingredients: Sequence[Dict[str, Any]]) -> Optional[str]:
    """Return a reason string when this recipe is off-limits for the user."""
    diet = (user["diet"] or "").strip().lower()
    excludes = _diet_excludes(diet)
    groups = _recipe_allergen_groups(ingredients)
    blocked = groups & excludes
    if blocked:
        return f"contains {', '.join(sorted(blocked))} (diet: {user['diet']})"
    allergy_groups = _allergy_groups(user["allergies"])
    hit = groups & allergy_groups
    if hit:
        return f"contains your allergen: {', '.join(sorted(hit))}"
    for term in allergy_groups - set(ALLERGEN_KEYWORDS):
        for ing in ingredients:
            if term in _norm(ing.get("item", "")):
                return f"contains your allergen: {term}"
    return None


def _pantry_items(conn: sqlite3.Connection, user_id: int) -> List[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM pantry WHERE user_id = ? ORDER BY expiry_date IS NULL, expiry_date",
        (user_id,),
    ).fetchall()


def _pantry_split(conn: sqlite3.Connection, user_id: int) -> Tuple[List[dict], List[dict], List[dict]]:
    """Split the pantry into (usable, expiring_soon, expired)."""
    today = _today()
    usable, expiring, expired = [], [], []
    for row in _pantry_items(conn, user_id):
        item = dict(row)
        expiry = _parse_date(row["expiry_date"])
        item["days_left"] = (expiry - today).days if expiry else None
        if expiry and expiry < today:
            expired.append(item)
        else:
            usable.append(item)
            if item["days_left"] is not None and item["days_left"] <= 2:
                expiring.append(item)
    return usable, expiring, expired


def _resolve_recipe(conn: sqlite3.Connection, name: str) -> Optional[sqlite3.Row]:
    """Find a recipe by name: exact (case-insensitive) first, then fuzzy."""
    if not name:
        return None
    row = conn.execute(
        "SELECT * FROM recipes WHERE LOWER(name) = LOWER(?) ORDER BY user_id IS NOT NULL DESC LIMIT 1",
        (str(name).strip(),),
    ).fetchone()
    if row:
        return row
    row = conn.execute(
        "SELECT * FROM recipes WHERE LOWER(name) LIKE LOWER(?) ORDER BY user_id IS NOT NULL DESC LIMIT 1",
        (f"%{str(name).strip()}%",),
    ).fetchone()
    if row:
        return row
    target = _tokens(name)
    if not target:
        return None
    best, best_score = None, 0
    for candidate in conn.execute("SELECT * FROM recipes"):
        score = len(target & _tokens(candidate["name"]))
        if score > best_score:
            best, best_score = candidate, score
    return best


def _recipe_rating(conn: sqlite3.Connection, recipe_id: int) -> Tuple[Optional[float], int]:
    row = conn.execute(
        "SELECT AVG(rating) AS avg_rating, COUNT(*) AS n FROM feedback WHERE recipe_id = ?",
        (recipe_id,),
    ).fetchone()
    if not row or not row["n"]:
        return None, 0
    return round(float(row["avg_rating"]), 1), int(row["n"])


def _parse_nutrition(value: Any) -> Dict[str, Any]:
    """Accept a dict, JSON, or free text like '350 kcal, 15g protein'."""
    if isinstance(value, dict):
        return value
    if value in (None, ""):
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except (TypeError, ValueError):
            pass
    text = str(value).lower()
    out: Dict[str, Any] = {}
    patterns = {
        "kcal": r"(\d+(?:\.\d+)?)\s*(?:kcal|calories|cal)\b",
        "protein_g": r"(\d+(?:\.\d+)?)\s*g?\s*(?:of\s*)?protein",
        "carbs_g": r"(\d+(?:\.\d+)?)\s*g?\s*(?:of\s*)?(?:carbs|carbohydrates)",
        "fat_g": r"(\d+(?:\.\d+)?)\s*g?\s*(?:of\s*)?fat",
        "fiber_g": r"(\d+(?:\.\d+)?)\s*g?\s*(?:of\s*)?(?:fiber|fibre)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            out[key] = float(match.group(1))
    return out


def _format_nutrition(nutrition: Dict[str, Any], factor: float = 1.0, label: str = "") -> str:
    if not nutrition:
        return "nutrition data unavailable"
    order = [("kcal", "kcal"), ("protein_g", "g protein"), ("carbs_g", "g carbs"),
             ("fat_g", "g fat"), ("fiber_g", "g fiber")]
    parts = []
    for key, unit in order:
        if key in nutrition and nutrition[key] is not None:
            try:
                value = float(nutrition[key]) * factor
            except (TypeError, ValueError):
                continue
            parts.append(f"{round(value)}{unit}")
    return ", ".join(parts) + (f" {label}" if label else "")


def _recipe_ingredients(row: sqlite3.Row) -> List[Dict[str, Any]]:
    ingredients = _loads(row["ingredients"], [])
    if not isinstance(ingredients, list):
        return []
    normalised = []
    for ing in ingredients:
        if isinstance(ing, dict):
            normalised.append({
                "item": str(ing.get("item") or ing.get("name") or ""),
                "quantity": ing.get("quantity", ing.get("qty")),
                "unit": ing.get("unit", ""),
            })
        elif isinstance(ing, str):
            normalised.append({"item": ing, "quantity": None, "unit": ""})
    return [i for i in normalised if i["item"]]


# ---------------------------------------------------------------------------
# pantry tools
# ---------------------------------------------------------------------------
def add_pantry_item(
    user_id: int,
    ingredient: str,
    quantity: float,
    unit: str,
    expiry_days: int = 7,
) -> str:
    """Add an ingredient to the pantry. Same ingredient + unit is topped up."""
    if not ingredient or not str(ingredient).strip():
        return "I need an ingredient name to add anything to the pantry."
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return f"'{quantity}' is not a valid quantity."
    if quantity <= 0:
        return "Quantity must be greater than zero."

    try:
        expiry_days = int(expiry_days)
    except (TypeError, ValueError):
        expiry_days = 7
    expiry = (_today() + timedelta(days=max(expiry_days, 0))).isoformat()

    conn = get_conn()
    try:
        _get_user(conn, user_id)
        existing = None
        for row in conn.execute(
            "SELECT * FROM pantry WHERE user_id = ?", (user_id,)
        ):
            if _same_ingredient(row["ingredient"], ingredient) and _norm(row["unit"]) == _norm(unit):
                existing = row
                break
        if existing:
            conn.execute(
                "UPDATE pantry SET quantity = quantity + ?, expiry_date = ? WHERE id = ?",
                (quantity, expiry, existing["id"]),
            )
            total = float(existing["quantity"]) + quantity
            action = f"Topped up {existing['ingredient']} to {_fmt_qty(total)} {unit}"
        else:
            conn.execute(
                "INSERT INTO pantry (user_id, ingredient, quantity, unit, expiry_date) VALUES (?, ?, ?, ?, ?)",
                (user_id, str(ingredient).strip(), quantity, str(unit).strip(), expiry),
            )
            action = f"Added {_fmt_qty(quantity)} {unit} of {str(ingredient).strip()}"
        conn.commit()
    finally:
        conn.close()
    return f"{action} in the pantry. Expires {expiry} ({expiry_days} days)."


def get_pantry_items(user_id: int) -> str:
    """List everything in the pantry, flagging what is expiring or expired."""
    conn = get_conn()
    try:
        _get_user(conn, user_id)
        usable, expiring, expired = _pantry_split(conn, user_id)
    finally:
        conn.close()

    if not usable and not expired:
        return "The pantry is empty. Tell me what you bought and I will add it."

    lines = [f"Pantry for user {user_id}:"]
    for item in usable:
        days = item["days_left"]
        flag = ""
        if days is not None and days <= 2:
            flag = f"  <-- use within {days} day(s)" if days > 0 else "  <-- use TODAY"
        lines.append(
            f"  [id={item['id']}] {item['ingredient']}: "
            f"{_fmt_qty(item['quantity'])} {item['unit']} (expires {item['expiry_date']}){flag}"
        )
    for item in expired:
        lines.append(
            f"  [id={item['id']}] {item['ingredient']}: "
            f"{_fmt_qty(item['quantity'])} {item['unit']} (EXPIRED {item['expiry_date']})"
        )
    if expiring:
        names = ", ".join(i["ingredient"] for i in expiring)
        lines.append(f"Use-first priority: {names}")
    return "\n".join(lines)


def remove_pantry_item(user_id: int, ingredient: str, quantity: Optional[float] = None) -> str:
    """Remove an ingredient entirely, or reduce its quantity."""
    conn = get_conn()
    try:
        _get_user(conn, user_id)
        matches = [r for r in _pantry_items(conn, user_id) if _same_ingredient(r["ingredient"], ingredient)]
        if not matches:
            return f"{ingredient} is not in the pantry."
        if quantity is None:
            removed = sum(float(r["quantity"]) for r in matches)
            conn.execute(
                "DELETE FROM pantry WHERE user_id = ? AND id IN ({})".format(
                    ",".join("?" * len(matches))
                ),
                (user_id, *[r["id"] for r in matches]),
            )
            conn.commit()
            return f"Removed {ingredient} ({_fmt_qty(removed)} in total) from the pantry."
        try:
            quantity = float(quantity)
        except (TypeError, ValueError):
            return f"'{quantity}' is not a valid quantity."
        row = matches[0]
        left = float(row["quantity"]) - quantity
        if left <= 0:
            conn.execute("DELETE FROM pantry WHERE id = ?", (row["id"],))
            conn.commit()
            return f"Used up the last {_fmt_qty(row['quantity'])} {row['unit']} of {row['ingredient']}."
        conn.execute("UPDATE pantry SET quantity = ? WHERE id = ?", (left, row["id"]))
        conn.commit()
        return (
            f"Deducted {_fmt_qty(quantity)}. {row['ingredient']} now at "
            f"{_fmt_qty(left)} {row['unit']}."
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# recipe tools
# ---------------------------------------------------------------------------
def suggest_recipe(user_id: int, max_time: int = 30, count: int = 3) -> str:
    """Rank recipes the user can realistically cook right now.

    Scoring blends pantry coverage, expiring items that need rescuing, past
    ratings, and the user's fitness goal. Recipes that clash with the user's
    diet or allergies are dropped before scoring.
    """
    try:
        max_time = int(max_time)
    except (TypeError, ValueError):
        max_time = 30
    try:
        count = max(1, min(int(count), 5))
    except (TypeError, ValueError):
        count = 3

    conn = get_conn()
    try:
        user = _get_user(conn, user_id)
        usable, expiring, _ = _pantry_split(conn, user_id)
        pantry_names = [i["ingredient"] for i in usable]
        expiring_names = [i["ingredient"] for i in expiring]

        candidates = []
        blocked_notes = []
        too_slow = 0
        for row in conn.execute("SELECT * FROM recipes WHERE user_id IS NULL OR user_id = ?", (user_id,)):
            ingredients = _recipe_ingredients(row)
            time_minutes = row["time_minutes"] or 0
            if max_time and time_minutes > max_time:
                too_slow += 1
                continue

            blocked = _blocks_recipe(user, ingredients)
            if blocked:
                blocked_notes.append(f"{row['name']} ({blocked})")
                continue

            have, missing = [], []
            for ing in ingredients:
                if any(_same_ingredient(ing["item"], name) for name in pantry_names):
                    have.append(ing["item"])
                else:
                    missing.append(ing["item"])

            coverage = len(have) / len(ingredients) if ingredients else 0.0
            rescue = sum(1 for name in expiring_names if any(_same_ingredient(name, h) for h in have))

            rating, rating_n = _recipe_rating(conn, row["id"])
            nutrition = _loads(row["nutrition"], {}) or {}
            goal_bonus, goal_note = 0.0, ""
            goal = (user["fitness_goal"] or "").lower()
            kcal = nutrition.get("kcal")
            protein = nutrition.get("protein_g")
            if "loss" in goal and kcal:
                goal_bonus = max(0.0, (450 - float(kcal)) / 45)
                goal_note = f"fits weight loss ({round(float(kcal))} kcal)"
            elif "muscle" in goal or "protein" in goal:
                if protein:
                    goal_bonus = min(float(protein) / 12.0, 3.0)
                    goal_note = f"{round(float(protein))}g protein"
            health = (user["health_issues"] or "").lower()
            if "diabet" in health and kcal:
                if float(kcal) > 450 or float(nutrition.get("carbs_g") or 0) > 45:
                    goal_bonus -= 2.0
                    goal_note = "higher carb - watch the portion"

            score = coverage * 60 + (rating or 3.0) * 4 + rescue * 8 + goal_bonus
            if not missing:
                score += 15  # cookable right now, no shopping needed

            candidates.append({
                "row": row,
                "ingredients": ingredients,
                "have": have,
                "missing": missing,
                "coverage": coverage,
                "rescue": rescue,
                "rating": rating,
                "rating_n": rating_n,
                "nutrition": nutrition,
                "goal_note": goal_note,
                "score": score,
            })

        candidates.sort(key=lambda c: c["score"], reverse=True)
        top = candidates[:count]

        if not top:
            hints = []
            if too_slow:
                hints.append(f"raise max_time above {max_time} min ({too_slow} recipe(s) were excluded)")
            if blocked_notes:
                hints.append("recipes skipped for diet/allergy: " + "; ".join(blocked_notes[:4]))
            return (
                "I could not find a recipe that fits those constraints. "
                + ("Try: " + " and ".join(hints) if hints else "Add more pantry items first.")
            )

        lines = [f"Top {len(top)} recipe(s) for user {user_id} (max {max_time} min):"]
        for idx, cand in enumerate(top, 1):
            row = cand["row"]
            lines.append("")
            lines.append(f"{idx}. {row['name']}  -  {row['time_minutes']} min, {row['cooking_method']}")
            lines.append(
                f"   pantry: you have {len(cand['have'])} of {len(cand['ingredients'])} ingredients"
                f" ({round(cand['coverage'] * 100)}%)"
            )
            if cand["missing"]:
                lines.append(f"   missing: {', '.join(cand['missing'])}")
            else:
                lines.append("   missing: nothing - you can cook this right now")
            nutrition_line = _format_nutrition(cand["nutrition"], 1.0, "per serving")
            lines.append(f"   nutrition: {nutrition_line}")
            extras = []
            if cand["rescue"]:
                extras.append(f"uses {cand['rescue']} item(s) expiring soon")
            if cand["rating"]:
                extras.append(f"your rating {cand['rating']}/5 from {cand['rating_n']} review(s)")
            if cand["goal_note"]:
                extras.append(cand["goal_note"])
            if extras:
                lines.append("   why: " + "; ".join(extras))
        return "\n".join(lines)
    finally:
        conn.close()


def add_recipe(
    name: str,
    ingredients: Any,
    steps: str,
    cooking_method: str = "cook",
    time_minutes: int = 30,
    servings: int = 2,
    nutrition: Any = None,
    user_id: Optional[int] = None,
) -> str:
    """Save a recipe so it can be planned, cooked and rated later."""
    if not name or not str(name).strip():
        return "A recipe needs a name."

    if isinstance(ingredients, str):
        text = ingredients.strip()
        try:
            ingredients = json.loads(text)
        except (TypeError, ValueError):
            ingredients = [{"item": p.strip().rstrip("."), "quantity": None, "unit": ""}
                           for p in re.split(r"[,;\n]", text) if p.strip()]
    if not isinstance(ingredients, list) or not ingredients:
        return "Give me the ingredient list, for example 'egg, onion, tomato'."
    cleaned = []
    for ing in ingredients:
        if isinstance(ing, dict):
            cleaned.append({
                "item": str(ing.get("item") or ing.get("name") or "").strip(),
                "quantity": ing.get("quantity", ing.get("qty")),
                "unit": str(ing.get("unit", "") or ""),
            })
        else:
            cleaned.append({"item": str(ing).strip(), "quantity": None, "unit": ""})
    cleaned = [c for c in cleaned if c["item"]]

    nutrition_data = _parse_nutrition(nutrition)
    try:
        time_minutes = int(time_minutes)
    except (TypeError, ValueError):
        time_minutes = 30
    try:
        servings = max(1, int(servings))
    except (TypeError, ValueError):
        servings = 2

    conn = get_conn()
    try:
        if user_id:
            _get_user(conn, user_id)
        existing = _resolve_recipe(conn, name)
        if existing and existing["name"].lower() == str(name).strip().lower():
            return f"'{existing['name']}' already exists (id={existing['id']}). I left it untouched."
        conn.execute(
            """
            INSERT INTO recipes
                (user_id, name, ingredients, steps, cooking_method,
                 time_minutes, servings, nutrition, tags, allergens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id if user_id else None,
                str(name).strip(),
                json.dumps(cleaned),
                str(steps or "").strip(),
                cooking_method,
                time_minutes,
                servings,
                json.dumps(nutrition_data),
                json.dumps([]),
                json.dumps(sorted(_recipe_allergen_groups(cleaned))),
            ),
        )
        conn.commit()
        recipe_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    finally:
        conn.close()

    bits = [f"Saved recipe '{str(name).strip()}' (id={recipe_id}), {time_minutes} min for {servings} servings."]
    if nutrition_data:
        bits.append(_format_nutrition(nutrition_data, 1.0, "per serving"))
    return " ".join(bits)


def get_nutrition(recipe_name: str, servings: int = 1) -> str:
    """Nutrition for a recipe, scaled to the number of servings.

    Stored nutrition is per serving, so the multiplier is the serving count.
    """
    try:
        servings = max(1, int(servings))
    except (TypeError, ValueError):
        servings = 1
    conn = get_conn()
    try:
        row = _resolve_recipe(conn, recipe_name)
    finally:
        conn.close()
    if not row:
        return (
            f"'{recipe_name}' is not in the recipe database, so I have no nutrition data for it. "
            "I can save it with add_recipe if you tell me the ingredients."
        )
    nutrition = _loads(row["nutrition"], {}) or {}
    if not nutrition:
        return f"'{row['name']}' has no nutrition data stored yet."
    return (
        f"{row['name']} - "
        + _format_nutrition(nutrition, servings, f"for {servings} serving(s)")
        + f". Recipe yields {row['servings'] or 1} serving(s)."
    )


# ---------------------------------------------------------------------------
# logging + feedback tools
# ---------------------------------------------------------------------------
def log_meal(
    user_id: int,
    recipe_name: str,
    servings: int = 1,
    cooked_on: Optional[str] = None,
) -> str:
    """Record a meal that was actually cooked."""
    if not recipe_name:
        return "Which meal did you cook?"
    try:
        servings = max(1, int(servings))
    except (TypeError, ValueError):
        servings = 1
    cooked = _parse_date(cooked_on) or _today()

    conn = get_conn()
    try:
        _get_user(conn, user_id)
        row = _resolve_recipe(conn, recipe_name)
        conn.execute(
            "INSERT INTO meal_log (user_id, recipe_id, recipe_name, servings, cooked_on) VALUES (?, ?, ?, ?, ?)",
            (user_id, row["id"] if row else None, row["name"] if row else str(recipe_name).strip(),
             servings, cooked.isoformat()),
        )
        conn.commit()
        total_meals = conn.execute(
            "SELECT COUNT(*) AS n FROM meal_log WHERE user_id = ?", (user_id,)
        ).fetchone()["n"]
    finally:
        conn.close()

    name = row["name"] if row else str(recipe_name).strip()
    line = f"Logged '{name}' x{servings} serving(s) on {cooked.isoformat()}. That is {total_meals} meal(s) logged."
    if row:
        nutrition = _loads(row["nutrition"], {}) or {}
        if nutrition:
            line += " " + _format_nutrition(nutrition, servings, "for this meal") + "."
    return line


def provide_feedback(
    user_id: int,
    recipe_name: str,
    rating: int,
    notes: str = "",
    quantity: str = "",
) -> str:
    """Store a rating so future suggestions can prefer what the user liked."""
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        return "Give me a rating from 1 to 5."
    if not 1 <= rating <= 5:
        return "Ratings run from 1 to 5."

    conn = get_conn()
    try:
        _get_user(conn, user_id)
        row = _resolve_recipe(conn, recipe_name)
        conn.execute(
            "INSERT INTO feedback (user_id, recipe_id, recipe_name, rating, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, row["id"] if row else None,
             row["name"] if row else str(recipe_name).strip(),
             rating, quantity or "", notes or ""),
        )
        conn.commit()
        if row:
            avg, n = _recipe_rating(conn, row["id"])
        else:
            avg_row = conn.execute(
                "SELECT AVG(rating) AS a, COUNT(*) AS n FROM feedback WHERE user_id = ? AND LOWER(recipe_name) = LOWER(?)",
                (user_id, str(recipe_name).strip()),
            ).fetchone()
            avg, n = (round(float(avg_row["a"]), 1) if avg_row["a"] else None), avg_row["n"]
    finally:
        conn.close()

    name = row["name"] if row else str(recipe_name).strip()
    line = f"Feedback recorded for '{name}': {rating}/5."
    if avg:
        line += f" Average is now {avg}/5 across {n} review(s)."
    if rating <= 2:
        line += " I will rank it lower next time."
    if notes:
        line += f' Notes: "{notes}".'
    return line


# ---------------------------------------------------------------------------
# meal planning tools
# ---------------------------------------------------------------------------
def plan_meal(
    user_id: int,
    recipe_name: str,
    day: str,
    meal_slot: str = "dinner",
    servings: int = 1,
    week_start: Optional[str] = None,
) -> str:
    """Add a recipe to the weekly plan."""
    conn = get_conn()
    try:
        _get_user(conn, user_id)
        row = _resolve_recipe(conn, recipe_name)
        if not row:
            return (
                f"I do not know a recipe called '{recipe_name}'. "
                "Save it with add_recipe first, or ask me to suggest one."
            )
        week = _week_start(week_start)
        try:
            servings = max(1, int(servings))
        except (TypeError, ValueError):
            servings = 1
        conn.execute(
            "DELETE FROM meal_plans WHERE user_id = ? AND week_start = ? AND day = ? AND meal_slot = ?",
            (user_id, week, str(day).strip(), str(meal_slot).strip()),
        )
        conn.execute(
            "INSERT INTO meal_plans (user_id, week_start, day, meal_slot, recipe_id, servings) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, week, str(day).strip(), str(meal_slot).strip(), row["id"], servings),
        )
        conn.commit()
        nutrition = _loads(row["nutrition"], {}) or {}
        kcal = nutrition.get("kcal")
        # what is this plan missing from the pantry?
        usable, _, _ = _pantry_split(conn, user_id)
        names = [i["ingredient"] for i in usable]
        missing = [i["item"] for i in _recipe_ingredients(row)
                   if not any(_same_ingredient(i["item"], n) for n in names)]
    finally:
        conn.close()

    line = (
        f"Planned '{row['name']}' for {str(day).strip()} {str(meal_slot).strip()} "
        f"(week of {week}, {servings} serving(s))"
    )
    if kcal:
        line += f", about {round(float(kcal) * servings)} kcal"
    line += "."
    if missing:
        line += f" Shopping needed: {', '.join(missing)}."
    return line


def get_meal_plan(user_id: int, week_start: Optional[str] = None) -> str:
    """Show the plan and the total calories per day."""
    week = _week_start(week_start)
    conn = get_conn()
    try:
        _get_user(conn, user_id)
        rows = conn.execute(
            """
            SELECT mp.day, mp.meal_slot, mp.servings, r.name, r.nutrition, r.time_minutes
            FROM meal_plans mp JOIN recipes r ON r.id = mp.recipe_id
            WHERE mp.user_id = ? AND mp.week_start = ?
            ORDER BY CASE mp.day
                        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
                        WHEN 'Sunday' THEN 7 ELSE 8 END, mp.meal_slot
            """,
            (user_id, week),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return f"No meals planned for the week of {week}. Ask me to plan one."

    by_day: Dict[str, List[sqlite3.Row]] = {}
    for row in rows:
        by_day.setdefault(row["day"] or "Unscheduled", []).append(row)

    lines = [f"Meal plan for the week of {week}:"]
    for day, meals in by_day.items():
        day_kcal = 0.0
        lines.append(f"  {day}:")
        for meal in meals:
            nutrition = _loads(meal["nutrition"], {}) or {}
            kcal = float(nutrition.get("kcal") or 0) * (meal["servings"] or 1)
            day_kcal += kcal
            kcal_txt = f", {round(kcal)} kcal" if kcal else ""
            lines.append(
                f"    {meal['meal_slot']}: {meal['name']} "
                f"({meal['servings']} serving(s), {meal['time_minutes']} min{kcal_txt})"
            )
        if day_kcal:
            lines.append(f"    day total: ~{round(day_kcal)} kcal")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# profile tools
# ---------------------------------------------------------------------------
def get_user_row(user_id: int) -> Dict[str, Any]:
    """Raw profile values, for prefilling UI forms."""
    conn = get_conn()
    try:
        return dict(_get_user(conn, user_id))
    finally:
        conn.close()


def get_user_profile(user_id: int) -> str:
    """Show what the agent knows about the user."""
    conn = get_conn()
    try:
        user = _get_user(conn, user_id)
        meals = conn.execute(
            "SELECT COUNT(*) AS n FROM meal_log WHERE user_id = ?", (user_id,)
        ).fetchone()["n"]
        planned = conn.execute(
            "SELECT COUNT(*) AS n FROM meal_plans WHERE user_id = ? AND week_start = ?",
            (user_id, _week_start()),
        ).fetchone()["n"]
    finally:
        conn.close()

    fields = [
        ("name", user["name"]), ("age", user["age"]), ("gender", user["gender"]),
        ("location", user["location"]), ("diet", user["diet"]),
        ("allergies", user["allergies"]), ("health_issues", user["health_issues"]),
        ("fitness_goal", user["fitness_goal"]), ("budget", user["budget"]),
    ]
    lines = [f"Profile for user {user_id}:"]
    for key, value in fields:
        if value not in (None, ""):
            lines.append(f"  {key}: {value}")
    lines.append(f"  meals logged: {meals}")
    lines.append(f"  meals planned this week: {planned}")
    return "\n".join(lines)


def save_user_profile(
    user_id: int,
    name: Optional[str] = None,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    location: Optional[str] = None,
    diet: Optional[str] = None,
    allergies: Optional[str] = None,
    health_issues: Optional[str] = None,
    fitness_goal: Optional[str] = None,
    budget: Optional[float] = None,
) -> str:
    """Create or update the profile. Only the supplied fields change."""
    provided = {
        "name": name, "age": age, "gender": gender, "location": location,
        "diet": diet, "allergies": allergies, "health_issues": health_issues,
        "fitness_goal": fitness_goal, "budget": budget,
    }
    updates = {k: v for k, v in provided.items() if v is not None}

    conn = get_conn()
    try:
        _get_user(conn, user_id)
        if updates:
            # normalise a few types so the LLM's output can be loose
            if "age" in updates:
                try:
                    updates["age"] = int(updates["age"])
                except (TypeError, ValueError):
                    updates.pop("age")
            if "budget" in updates:
                try:
                    updates["budget"] = float(updates["budget"])
                except (TypeError, ValueError):
                    updates.pop("budget")
        if updates:
            assignments = ", ".join(f"{key} = ?" for key in updates)
            conn.execute(
                f"UPDATE users SET {assignments} WHERE id = ?",
                (*updates.values(), user_id),
            )
            conn.commit()
        profile = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()

    if not updates:
        return "Nothing to update - tell me which detail changed."
    changed = ", ".join(f"{k} = {v}" for k, v in updates.items())
    note = ""
    if diet or allergies:
        note = " I will filter future suggestions with this."
    return f"Updated profile for user {user_id}: {changed}.{note}"


# ---------------------------------------------------------------------------
# convenience used by main.py
# ---------------------------------------------------------------------------
def tool_names() -> List[str]:
    return [
        "add_pantry_item", "get_pantry_items", "remove_pantry_item",
        "suggest_recipe", "add_recipe", "get_nutrition",
        "log_meal", "provide_feedback",
        "plan_meal", "get_meal_plan",
        "get_user_profile", "save_user_profile",
    ]
