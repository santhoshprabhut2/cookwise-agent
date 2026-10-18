# Smart Cooking Assistant — an Agentic AI

An autonomous agent that manages a home pantry, suggests recipes you can actually cook
tonight, plans the week, logs meals and tracks nutrition. The LLM decides which tools to
call; the tools do the real work against a SQLite database.

Built with the **OpenAI function-calling loop** (agentic AI pattern): the model is given a
set of tools plus live context, it chooses a tool, reads the result, and loops until it can
answer — no hardcoded conversation flow.

---

## 1. Features

| Capability | What the agent does |
|---|---|
| Pantry management | Adds ingredients, tops up duplicates, tracks expiry, deducts what you cook |
| Recipe suggestions | Ranks recipes by pantry coverage, expiring items, your past ratings and fitness goal |
| Diet & allergy safety | Filters out anything clashing with your diet or allergies before ranking |
| Meal planning | Builds a weekly plan with per-day calorie totals and a shopping list |
| Meal logging | Records what you actually cooked, with the calorie total for that meal |
| Feedback loop | Ratings feed back into the ranking, so disliked dishes sink |
| Nutrition tracking | Per-serving macros scaled to the servings you ate |
| Recipe authoring | Saves new dishes you describe so they can be planned and rated later |

## 2. Architecture

```
        User  --->  CLI (main.py)
                      |
                      |            Browser  --->  Streamlit UI (app.py)
                      |                                |
                      +---------------+----------------+
                                      v
                        +-----------------------------+
                        |   Agent loop (main.py)      |
                        |   OpenAI chat.completions   |
                        |   tool_choice="auto"        |
                        +-----------------------------+
                             |                  ^
                   tool call |                  | tool result (string)
                             v                  |
                        +-----------------------------+
                        |   Tool layer (tools.py)     |
                        |  12 deterministic functions |
                        +-----------------------------+
                                     |
                                     v
                          SQLite (cooking_assistant.db)
                   users | pantry | recipes | meal_plans | meal_log | feedback
```

Both front ends drive the *same* agent loop and the *same* database — the browser UI is not
a reimplementation, it just renders the loop's output and the database state.

The loop is the key idea: `main.py` never decides what to do. It sends the conversation plus
the tool schemas, executes whatever the model asks for, appends the result, and repeats until
the model returns plain text (max 8 rounds per turn as a safety valve).

### The 12 tools

| Tool | Purpose |
|---|---|
| `add_pantry_item` | Add or top up a pantry item with an expiry date |
| `get_pantry_items` | List the pantry, flagging expiring and expired items |
| `remove_pantry_item` | Remove an item or deduct a quantity after cooking |
| `suggest_recipe` | Rank cookable recipes (diet, allergy, time, expiry, rating aware) |
| `add_recipe` | Save a new recipe so it can be planned and rated |
| `get_nutrition` | Macros for a recipe, scaled to servings |
| `log_meal` | Record a meal that was actually cooked |
| `provide_feedback` | Store a 1–5 rating that influences future ranking |
| `plan_meal` | Put a recipe into a day/slot of the weekly plan |
| `get_meal_plan` | Show the plan with per-day calorie totals |
| `get_user_profile` | Read diet, allergies, health issues, goal, budget |
| `save_user_profile` | Update the profile (only the fields that changed) |

## 3. Files

```
main.py            agent loop, 12 tool schemas, CLI
app.py             Streamlit web UI (same agent, browser front end)
tools.py           the 12 tool implementations - all real logic, no stubs
schema.sql         6 tables + indexes, idempotent
seed_recipes.py    14 recipes with ingredients, steps and nutrition
test_tools.py      44 offline tests (no API key required)
requirements.txt   openai, python-dotenv, streamlit
.env.example       copy to .env and add your key
.gitignore         keeps .env and the database out of git
```

## 4. Setup

```bash
git clone https://github.com/santhoshprabhut2/cookwise-agent.git
cd cookwise-agent

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env             # then paste your OpenAI key into .env
```

## 5. Run

```bash
python main.py                                   # interactive chat
python main.py --once "what can I cook tonight?" # one turn, good for a demo
python main.py --verbose                         # show every tool call
python main.py --reset                           # wipe the local database
```

Or use the web UI:

```bash
streamlit run app.py
```

The sidebar shows your live pantry and this week's plan straight from the database, plus a
profile form you can edit. Change your diet to `vegan` and ask for dinner again to watch the
suggestions change. After each answer, the **"What the agent did"** panel lists every tool
call the model made and the raw result it got back — that panel is the clearest evidence the
system is genuinely agentic rather than a scripted chatbot.

Bind to localhost if you are on an untrusted network:

```bash
streamlit run app.py --server.address 127.0.0.1
```

Verify everything without an API key:

```bash
python test_tools.py
```

### Sample interaction

```
$ python main.py --verbose

You: I bought 4 tomatoes, they'll go bad in 2 days
  [tool] add_pantry_item({"ingredient": "tomato", "quantity": 4, "unit": "pcs", "expiry_days": 2})
Agent: Added 4 pcs of tomato in the pantry, expiring 2026-10-13. What else is in the kitchen?

You: also 2 onions, 1 cup rice and some curd
  [tool] add_pantry_item({"ingredient": "onion", ...})
Agent: Noted. Your curd is at 1 cup and expires tomorrow, so use it soon.

You: I'm vegetarian, allergic to peanuts, trying to lose weight
  [tool] save_user_profile({"diet": "vegetarian", "allergies": "peanuts", "fitness_goal": "weight loss"})
Agent: Saved. I'll keep eggs, meat and peanuts out of your suggestions.

You: what should I cook tonight?
  [tool] suggest_recipe({"max_time": 30})
Agent: Three options, best first:
  1. Tomato Rice (25 min) - you have 3 of 6 ingredients, just need curry leaves,
     mustard seeds and oil. ~330 kcal per serving, and it uses up your tomatoes.
  2. Curd Rice (15 min, no cooking) - need mustard seeds, ginger and curry leaves.
     ~270 kcal, and it saves the curd expiring tomorrow.
  3. Dal Tadka (30 min) - needs toor dal, garlic, ghee and cumin. ~240 kcal.
```

The ranking above is produced by real tool output, reproduced here verbatim:

```
Top 3 recipe(s) for user 1 (max 30 min):

1. Tomato Rice  -  25 min, one-pot
   pantry: you have 3 of 6 ingredients (50%)
   missing: curry leaves, mustard seeds, oil
   nutrition: 330kcal, 7g protein, 60g carbs, 7g fat, 3g fiber per serving
   why: uses 1 item(s) expiring soon; fits weight loss (330 kcal)

2. Curd Rice  -  15 min, no-cook
   pantry: you have 2 of 5 ingredients (40%)
   missing: mustard seeds, ginger, curry leaves
   nutrition: 270kcal, 9g protein, 46g carbs, 5g fat, 2g fiber per serving
   why: uses 1 item(s) expiring soon; fits weight loss (270 kcal)
```

Notice the agent suggested the curd dish partly because the curd expires tomorrow — that
ordering comes from scoring, not from the model's imagination.

## 6. How the ranking works

```
score = coverage x 60      # share of ingredients already in the pantry
      + rating      x 4    # your average rating, defaults to 3
      + rescued     x 8    # expiring items the recipe would use up
      + goal bonus         # lighter food for weight loss, protein for muscle gain
      + 15                 # flat bonus when nothing is missing at all
```

Recipes that clash with the user's diet or allergies are dropped **before** scoring, so
they can never appear. `vegetarian` excludes egg (use `eggetarian` if you eat eggs),
`vegan` also excludes dairy.

Ingredient matching is fuzzy on purpose: "2 Tomatoes" in the pantry satisfies a recipe
asking for 1 tomato, and `Dahi` is treated as `curd`, via a small synonym map.

## 7. Design decisions worth explaining

- **Deterministic tools, probabilistic planner.** The LLM picks *what* to do; the ranking,
  filtering and arithmetic live in Python. That makes suggestions reproducible and testable.
- **Tools return strings, never raise.** A bad tool call comes back as text the model can
  read and recover from, so one bad argument does not kill the conversation.
- **Arguments are filtered against the real signature.** If the model invents a parameter,
  it is dropped and the fact is reported back to it.
- **`get_nutrition` refuses to guess.** For an unknown dish it says so and offers
  `add_recipe`, instead of inventing calories.
- **The profile is injected into the system prompt** every turn, along with a live pantry
  snapshot, so the model starts oriented without burning a tool call.

## 8. Known limitations

- Ingredient matching is name-based, not a real ontology; quantities are only compared when
  the units match. "500 g chicken" satisfies a recipe needing "200 g chicken".
- Nutrition values are approximate seed data, fine for planning, not for medical use.
- Health conditions are handled with a light touch: diabetes down-ranks high-carb dishes and
  warns, but this is not dietary advice.
- Single-user CLI; there is no auth or web UI. The `user_id` column is there for multi-user use.

## 9. Grading criteria mapping

| Criterion | Where to look |
|---|---|
| Agentic behaviour (autonomous tool selection) | `main.py` `run_agent`, `TOOL_SCHEMAS` |
| Tool/function implementation | `tools.py`, all 12 functions |
| Database design | `schema.sql`, 6 normalised tables with foreign keys |
| Domain logic (the hard part) | `suggest_recipe` scoring, `_blocks_recipe` filtering |
| Feedback loop | `provide_feedback` writes, `suggest_recipe` reads the average |
| Testing | `test_tools.py`, 44 tests, runs without an API key |
| Documentation | this file |
| Deployment | `app.py` secret merging, `.streamlit/`, section 11 |

## 10. The repository

The project lives at **https://github.com/santhoshprabhut2/cookwise-agent**, on branch `main`.

Clone and run it:

```bash
git clone https://github.com/santhoshprabhut2/cookwise-agent.git
cd cookwise-agent
pip install -r requirements.txt
python test_tools.py     # verifies the whole tool layer, no API key needed
streamlit run app.py     # the reader supplies their own key in .env
```

## 11. Deployment

The web UI ships cloud-ready. It is deployed on **Streamlit Community Cloud**:

1. Fork or use this repository.
2. Sign in at [share.streamlit.io](https://share.streamlit.io) (GitHub or Google).
3. **Create app → Deploy a public app from GitHub**, pick this repo, branch `main`, main
   file `app.py`, and let Streamlit pick the Python version.
4. Before or after deploying, open **App settings → Secrets** and paste:

   ```toml
   OPENAI_API_KEY = "sk-..."
   ```

   There is a ready-made template in `.streamlit/secrets.example.toml`.

Notes for a deployed instance:

- `app.py` merges `st.secrets` into the process environment at startup, so the same
  key-loading path works locally (`.env`) and in the cloud (`secrets`).
- The SQLite database is recreated and the 14 recipes re-seeded on every fresh container
  start (`tools.init_db(seed=True)` runs at boot), so no migration step is needed. Anything
  added while the app runs is stored in SQLite and lasts until the container restarts; the
  `.gitignore`/`reset` button in the sidebar work exactly the same as locally.
- The API key never touches the repository: locally it lives in `.env`, in the cloud in the
  encrypted Streamlit secrets store.
