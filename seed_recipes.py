"""Seed recipes so the agent has something real to reason over.

Run directly to (re)seed the database:

    python seed_recipes.py

`main.py` also calls `seed()` on start-up, and it is a no-op when the table
already has rows, so nothing is duplicated.
"""

from __future__ import annotations

import json
import sqlite3

# nutrition values are per serving and approximate - good enough for planning,
# not a substitute for a nutritionist.
RECIPES = [
    {
        "name": "Masala Omelette",
        "time_minutes": 15,
        "servings": 2,
        "cooking_method": "pan-fry",
        "tags": ["non_veg", "high_protein", "low_carb", "gluten_free"],
        "ingredients": [
            {"item": "egg", "quantity": 4, "unit": "pcs"},
            {"item": "onion", "quantity": 1, "unit": "pcs"},
            {"item": "tomato", "quantity": 1, "unit": "pcs"},
            {"item": "chilli", "quantity": 1, "unit": "pcs"},
            {"item": "oil", "quantity": 1, "unit": "tbsp"},
            {"item": "salt", "quantity": 1, "unit": "pinch"},
        ],
        "steps": "Beat the eggs with salt. Saute onion, tomato and chilli. "
                 "Pour in the eggs and cook until set. Fold and serve.",
        "nutrition": {"kcal": 210, "protein_g": 14, "carbs_g": 6, "fat_g": 15, "fiber_g": 1},
    },
    {
        "name": "Vegetable Poha",
        "time_minutes": 20,
        "servings": 2,
        "cooking_method": "saute",
        "tags": ["vegan", "vegetarian", "gluten_free", "low_fat"],
        "ingredients": [
            {"item": "poha", "quantity": 2, "unit": "cups"},
            {"item": "onion", "quantity": 1, "unit": "pcs"},
            {"item": "peanuts", "quantity": 30, "unit": "g"},
            {"item": "turmeric", "quantity": 1, "unit": "tsp"},
            {"item": "lemon", "quantity": 1, "unit": "pcs"},
            {"item": "oil", "quantity": 1, "unit": "tbsp"},
        ],
        "steps": "Rinse the poha until soft. Temper turmeric in oil, add onion and "
                 "peanuts, then the poha. Finish with lemon and coriander.",
        "nutrition": {"kcal": 280, "protein_g": 6, "carbs_g": 45, "fat_g": 9, "fiber_g": 3},
    },
    {
        "name": "Egg Curry with Rice",
        "time_minutes": 30,
        "servings": 2,
        "cooking_method": "simmer",
        "tags": ["non_veg", "high_protein"],
        "ingredients": [
            {"item": "egg", "quantity": 4, "unit": "pcs"},
            {"item": "onion", "quantity": 2, "unit": "pcs"},
            {"item": "tomato", "quantity": 2, "unit": "pcs"},
            {"item": "rice", "quantity": 1, "unit": "cup"},
            {"item": "garlic", "quantity": 4, "unit": "cloves"},
            {"item": "oil", "quantity": 2, "unit": "tbsp"},
        ],
        "steps": "Boil and halve the eggs. Make an onion-tomato masala, add water and "
                 "simmer the eggs in it. Serve over steamed rice.",
        "nutrition": {"kcal": 480, "protein_g": 20, "carbs_g": 52, "fat_g": 20, "fiber_g": 4},
    },
    {
        "name": "Paneer Butter Masala",
        "time_minutes": 35,
        "servings": 3,
        "cooking_method": "simmer",
        "tags": ["vegetarian", "high_protein", "gluten_free"],
        "ingredients": [
            {"item": "paneer", "quantity": 250, "unit": "g"},
            {"item": "tomato", "quantity": 4, "unit": "pcs"},
            {"item": "butter", "quantity": 2, "unit": "tbsp"},
            {"item": "cream", "quantity": 3, "unit": "tbsp"},
            {"item": "cashew", "quantity": 20, "unit": "g"},
            {"item": "garlic", "quantity": 4, "unit": "cloves"},
        ],
        "steps": "Blend cooked tomato, cashew and garlic into a paste. Simmer with "
                 "butter and cream, then fold in cubed paneer.",
        "nutrition": {"kcal": 430, "protein_g": 18, "carbs_g": 14, "fat_g": 33, "fiber_g": 3},
    },
    {
        "name": "Chana Masala",
        "time_minutes": 35,
        "servings": 3,
        "cooking_method": "simmer",
        "tags": ["vegan", "vegetarian", "gluten_free", "high_fiber"],
        "ingredients": [
            {"item": "chickpeas", "quantity": 2, "unit": "cups"},
            {"item": "onion", "quantity": 2, "unit": "pcs"},
            {"item": "tomato", "quantity": 2, "unit": "pcs"},
            {"item": "ginger", "quantity": 1, "unit": "inch"},
            {"item": "garam masala", "quantity": 1, "unit": "tsp"},
            {"item": "oil", "quantity": 1, "unit": "tbsp"},
        ],
        "steps": "Saute onion, ginger and tomato into a masala. Add boiled chickpeas "
                 "with a little water and simmer until thick.",
        "nutrition": {"kcal": 320, "protein_g": 14, "carbs_g": 45, "fat_g": 9, "fiber_g": 12},
    },
    {
        "name": "Vegetable Khichdi",
        "time_minutes": 30,
        "servings": 2,
        "cooking_method": "pressure-cook",
        "tags": ["vegetarian", "gluten_free", "comfort", "low_fat"],
        "ingredients": [
            {"item": "rice", "quantity": 1, "unit": "cup"},
            {"item": "moong dal", "quantity": 0.5, "unit": "cup"},
            {"item": "carrot", "quantity": 1, "unit": "pcs"},
            {"item": "peas", "quantity": 0.5, "unit": "cup"},
            {"item": "turmeric", "quantity": 1, "unit": "tsp"},
            {"item": "ghee", "quantity": 1, "unit": "tbsp"},
        ],
        "steps": "Wash rice and dal, add chopped vegetables, turmeric and water. "
                 "Pressure cook for 3 whistles, finish with ghee.",
        "nutrition": {"kcal": 350, "protein_g": 12, "carbs_g": 58, "fat_g": 7, "fiber_g": 6},
    },
    {
        "name": "Tomato Rice",
        "time_minutes": 25,
        "servings": 2,
        "cooking_method": "one-pot",
        "tags": ["vegan", "vegetarian", "gluten_free", "budget"],
        "ingredients": [
            {"item": "rice", "quantity": 1, "unit": "cup"},
            {"item": "tomato", "quantity": 3, "unit": "pcs"},
            {"item": "onion", "quantity": 1, "unit": "pcs"},
            {"item": "curry leaves", "quantity": 1, "unit": "sprig"},
            {"item": "mustard seeds", "quantity": 1, "unit": "tsp"},
            {"item": "oil", "quantity": 1, "unit": "tbsp"},
        ],
        "steps": "Temper mustard seeds and curry leaves, add onion and tomato, then "
                 "the rice with twice its volume of water. Cook until fluffy.",
        "nutrition": {"kcal": 330, "protein_g": 7, "carbs_g": 60, "fat_g": 7, "fiber_g": 3},
    },
    {
        "name": "Grilled Chicken Salad",
        "time_minutes": 25,
        "servings": 2,
        "cooking_method": "grill",
        "tags": ["non_veg", "high_protein", "low_carb", "gluten_free"],
        "ingredients": [
            {"item": "chicken breast", "quantity": 300, "unit": "g"},
            {"item": "lettuce", "quantity": 1, "unit": "head"},
            {"item": "cucumber", "quantity": 1, "unit": "pcs"},
            {"item": "olive oil", "quantity": 1, "unit": "tbsp"},
            {"item": "lemon", "quantity": 1, "unit": "pcs"},
        ],
        "steps": "Marinate the chicken in olive oil, lemon and pepper. Grill 6 minutes "
                 "per side, slice, and toss with the salad vegetables.",
        "nutrition": {"kcal": 290, "protein_g": 38, "carbs_g": 8, "fat_g": 11, "fiber_g": 3},
    },
    {
        "name": "Tofu Vegetable Stir Fry",
        "time_minutes": 20,
        "servings": 2,
        "cooking_method": "stir-fry",
        "tags": ["vegan", "vegetarian", "high_protein", "low_carb"],
        "ingredients": [
            {"item": "tofu", "quantity": 250, "unit": "g"},
            {"item": "capsicum", "quantity": 1, "unit": "pcs"},
            {"item": "carrot", "quantity": 1, "unit": "pcs"},
            {"item": "soy sauce", "quantity": 1, "unit": "tbsp"},
            {"item": "garlic", "quantity": 3, "unit": "cloves"},
            {"item": "oil", "quantity": 1, "unit": "tbsp"},
        ],
        "steps": "Pan-fry the tofu until golden. Stir fry the vegetables on high heat, "
                 "return the tofu and finish with soy sauce.",
        "nutrition": {"kcal": 260, "protein_g": 19, "carbs_g": 12, "fat_g": 16, "fiber_g": 4},
    },
    {
        "name": "Dal Tadka",
        "time_minutes": 30,
        "servings": 3,
        "cooking_method": "simmer",
        "tags": ["vegetarian", "gluten_free", "high_protein", "budget"],
        "ingredients": [
            {"item": "toor dal", "quantity": 1, "unit": "cup"},
            {"item": "tomato", "quantity": 2, "unit": "pcs"},
            {"item": "garlic", "quantity": 4, "unit": "cloves"},
            {"item": "ghee", "quantity": 1, "unit": "tbsp"},
            {"item": "cumin", "quantity": 1, "unit": "tsp"},
        ],
        "steps": "Pressure cook the dal with tomato. Heat ghee with cumin and garlic "
                 "and pour the tempering over the dal.",
        "nutrition": {"kcal": 240, "protein_g": 15, "carbs_g": 33, "fat_g": 6, "fiber_g": 9},
    },
    {
        "name": "Oats Upma",
        "time_minutes": 15,
        "servings": 2,
        "cooking_method": "saute",
        "tags": ["vegetarian", "high_fiber", "low_fat", "diabetic_friendly"],
        "ingredients": [
            {"item": "oats", "quantity": 1, "unit": "cup"},
            {"item": "onion", "quantity": 1, "unit": "pcs"},
            {"item": "carrot", "quantity": 1, "unit": "pcs"},
            {"item": "mustard seeds", "quantity": 1, "unit": "tsp"},
            {"item": "oil", "quantity": 2, "unit": "tsp"},
        ],
        "steps": "Roast the oats. Temper mustard seeds, saute onion and carrot, add "
                 "water and stir in the oats until fluffy.",
        "nutrition": {"kcal": 190, "protein_g": 7, "carbs_g": 30, "fat_g": 5, "fiber_g": 5},
    },
    {
        "name": "Curd Rice",
        "time_minutes": 15,
        "servings": 2,
        "cooking_method": "no-cook",
        "tags": ["vegetarian", "gluten_free", "comfort", "probiotic"],
        "ingredients": [
            {"item": "rice", "quantity": 1, "unit": "cup"},
            {"item": "curd", "quantity": 1, "unit": "cup"},
            {"item": "mustard seeds", "quantity": 1, "unit": "tsp"},
            {"item": "ginger", "quantity": 1, "unit": "inch"},
            {"item": "curry leaves", "quantity": 1, "unit": "sprig"},
        ],
        "steps": "Mash cooked rice with curd and salt. Temper mustard seeds, ginger "
                 "and curry leaves, then mix through.",
        "nutrition": {"kcal": 270, "protein_g": 9, "carbs_g": 46, "fat_g": 5, "fiber_g": 2},
    },
    {
        "name": "Aloo Paratha",
        "time_minutes": 40,
        "servings": 2,
        "cooking_method": "griddle",
        "tags": ["vegetarian", "comfort", "budget"],
        "ingredients": [
            {"item": "wheat flour", "quantity": 2, "unit": "cups"},
            {"item": "potato", "quantity": 3, "unit": "pcs"},
            {"item": "ghee", "quantity": 2, "unit": "tbsp"},
            {"item": "green chilli", "quantity": 1, "unit": "pcs"},
            {"item": "cumin", "quantity": 1, "unit": "tsp"},
        ],
        "steps": "Knead a soft dough. Mash boiled potato with spices, stuff into the "
                 "dough, roll and cook on a griddle with ghee.",
        "nutrition": {"kcal": 420, "protein_g": 10, "carbs_g": 62, "fat_g": 14, "fiber_g": 6},
    },
    {
        "name": "Quinoa Vegetable Bowl",
        "time_minutes": 25,
        "servings": 2,
        "cooking_method": "boil",
        "tags": ["vegan", "vegetarian", "high_protein", "gluten_free", "diabetic_friendly"],
        "ingredients": [
            {"item": "quinoa", "quantity": 1, "unit": "cup"},
            {"item": "chickpeas", "quantity": 1, "unit": "cup"},
            {"item": "cucumber", "quantity": 1, "unit": "pcs"},
            {"item": "tomato", "quantity": 1, "unit": "pcs"},
            {"item": "olive oil", "quantity": 1, "unit": "tbsp"},
            {"item": "lemon", "quantity": 1, "unit": "pcs"},
        ],
        "steps": "Boil the quinoa. Toss with chickpeas and chopped vegetables, then "
                 "dress with olive oil and lemon.",
        "nutrition": {"kcal": 380, "protein_g": 16, "carbs_g": 50, "fat_g": 12, "fiber_g": 10},
    },
]


def seed(conn: sqlite3.Connection, force: bool = False) -> int:
    """Insert the shared recipes. Returns the number of rows written."""
    if force:
        conn.execute("DELETE FROM recipes WHERE user_id IS NULL")

    existing = {r[0].lower() for r in conn.execute("SELECT name FROM recipes")}
    written = 0
    for recipe in RECIPES:
        if recipe["name"].lower() in existing:
            continue  # naive but adequate: skips exact name matches
        conn.execute(
            """
            INSERT INTO recipes
                (user_id, name, ingredients, steps, cooking_method,
                 time_minutes, servings, nutrition, tags, allergens)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recipe["name"],
                json.dumps(recipe["ingredients"]),
                recipe["steps"],
                recipe["cooking_method"],
                recipe["time_minutes"],
                recipe["servings"],
                json.dumps(recipe["nutrition"]),
                json.dumps(recipe["tags"]),
                json.dumps([]),  # allergens are derived at query time
            ),
        )
        written += 1
    conn.commit()
    return written


def main() -> None:
    from tools import get_conn, init_db

    path = init_db(seed=False)
    conn = get_conn()
    try:
        count = seed(conn, force="--force" in __import__("sys").argv)
    finally:
        conn.close()
    print(f"Seeded {count} recipe(s) into {path}")


if __name__ == "__main__":
    main()
