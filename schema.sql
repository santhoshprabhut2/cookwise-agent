-- Smart Cooking Assistant Agent - database schema
-- Every statement is idempotent so init_db() can run on every start-up.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users: the agent personalises suggestions from this profile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    age           INTEGER,
    gender        TEXT,
    location      TEXT,
    diet          TEXT,              -- vegan | vegetarian | eggetarian | non-veg
    allergies     TEXT,              -- free text, e.g. "peanuts, dairy"
    health_issues TEXT,              -- free text, e.g. "diabetes"
    fitness_goal  TEXT,              -- e.g. "weight loss", "muscle gain"
    budget        REAL,              -- weekly grocery budget
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- pantry: what the user has at home right now
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pantry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    ingredient  TEXT    NOT NULL,
    quantity    REAL    NOT NULL,
    unit        TEXT    NOT NULL,
    expiry_date DATE,
    added_date  DATE DEFAULT CURRENT_DATE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- recipes: user_id NULL means a shared recipe available to everybody
-- ingredients / nutrition / tags / allergens are JSON encoded TEXT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER,
    name           TEXT NOT NULL,
    ingredients    TEXT NOT NULL,     -- [{"item": "tomato", "quantity": 2, "unit": "pcs"}]
    steps          TEXT NOT NULL,
    cooking_method TEXT,
    time_minutes   INTEGER,
    servings       INTEGER DEFAULT 2,
    nutrition      TEXT,              -- {"kcal":..,"protein_g":..,"carbs_g":..,"fat_g":..,"fiber_g":..}
    tags           TEXT,              -- ["vegetarian", "gluten_free", "high_protein"]
    allergens      TEXT,              -- ["dairy", "egg"] derived from ingredients
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- meal_plans: the plan for the week ahead
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    week_start DATE,
    day        TEXT,
    meal_slot  TEXT,
    recipe_id  INTEGER,
    servings   INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);

-- ---------------------------------------------------------------------------
-- meal_log: what was actually cooked (separate from the plan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    recipe_id   INTEGER,
    recipe_name TEXT,
    servings    INTEGER DEFAULT 1,
    cooked_on   DATE DEFAULT CURRENT_DATE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);

-- ---------------------------------------------------------------------------
-- feedback: ratings that feed back into future suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    recipe_id   INTEGER,
    recipe_name TEXT,
    rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
    quantity    TEXT,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);

CREATE INDEX IF NOT EXISTS idx_pantry_user       ON pantry(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_log_user     ON meal_log(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_recipe   ON feedback(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_week   ON meal_plans(user_id, week_start);

-- A default profile so the agent always has a user to attach data to.
INSERT OR IGNORE INTO users (id, name, diet, allergies, health_issues, fitness_goal)
VALUES (1, 'Demo User', 'vegetarian', '', '', 'maintain weight');
