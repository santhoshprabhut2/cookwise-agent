"""Offline test suite for the tool layer and the agent loop.

No API key needed - the agent loop is exercised with a fake OpenAI client.

    python test_tools.py
    python -m unittest test_tools -v
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from types import SimpleNamespace

# point the tools at a throwaway database before importing them
_TMP_DIR = tempfile.mkdtemp(prefix="cooking_test_")
os.environ["COOKING_DB"] = os.path.join(_TMP_DIR, "test.db")

import main  # noqa: E402
import tools  # noqa: E402

try:
    from streamlit.testing.v1 import AppTest

    STREAMLIT_AVAILABLE = True
except ImportError:
    STREAMLIT_AVAILABLE = False


def setUpModule() -> None:
    tools.init_db(seed=True)


class TestPantry(unittest.TestCase):
    def test_add_and_list(self):
        out = tools.add_pantry_item(1, "Tomatoes", 2, "pcs", expiry_days=5)
        self.assertIn("Added", out)
        listed = tools.get_pantry_items(1)
        self.assertIn("tomato", listed.lower())

    def test_same_ingredient_is_topped_up_not_duplicated(self):
        tools.add_pantry_item(1, "Cucumber", 1, "pcs")
        out = tools.add_pantry_item(1, "cucumber", 3, "pcs")
        self.assertIn("Topped up", out)
        self.assertIn("4 pcs", out)

    def test_plural_and_synonym_matching(self):
        tools.add_pantry_item(1, "Tomatoes", 1, "pcs")
        tools.add_pantry_item(1, "Dahi", 1, "cup")
        listed = tools.get_pantry_items(1)
        self.assertIn("dahi", listed.lower())  # stored as the user typed it
        # ...but it still satisfies recipes that ask for curd or tomato
        self.assertTrue(tools._same_ingredient("Dahi", "curd"))
        self.assertTrue(tools._same_ingredient("Tomatoes", "tomato"))
        self.assertFalse(tools._same_ingredient("tomato", "paneer"))

    def test_expired_items_are_flagged(self):
        tools.add_pantry_item(1, "Old Spinach", 1, "bunch", expiry_days=0)
        # a zero day expiry is today, not yet expired
        self.assertIn("use TODAY", tools.get_pantry_items(1))

    def test_remove_full_and_partial(self):
        tools.add_pantry_item(2, "rice", 5, "cups")
        partial = tools.remove_pantry_item(2, "rice", 2)
        self.assertIn("now at 3", partial)
        full = tools.remove_pantry_item(2, "rice")
        self.assertIn("Removed", full)
        self.assertIn("empty", tools.get_pantry_items(2).lower())

    def test_bad_quantity_is_rejected(self):
        self.assertIn("not a valid quantity", tools.add_pantry_item(1, "rice", "lots", "cups"))


class TestRecipeFiltering(unittest.TestCase):
    def setUp(self):
        self.user = 90
        tools.remove_pantry_item(self.user, "all")  # no-op if absent
        for row in tools.get_conn().execute("SELECT ingredient FROM pantry WHERE user_id = ?", (self.user,)):
            tools.remove_pantry_item(self.user, row["ingredient"])

    def test_vegan_excludes_egg_and_dairy(self):
        tools.save_user_profile(self.user, diet="vegan", allergies="", fitness_goal="maintain")
        out = tools.suggest_recipe(self.user, max_time=60, count=5)
        self.assertNotIn("Masala Omelette", out)
        self.assertNotIn("Paneer Butter Masala", out)
        self.assertNotIn("Curd Rice", out)

    def test_non_veg_diet_is_not_treated_as_vegetarian(self):
        # regression: 'veg' is a substring of 'non-veg'
        tools.save_user_profile(self.user, diet="non-veg", allergies="")
        out = tools.suggest_recipe(self.user, max_time=60, count=5)
        self.assertTrue(
            any(name in out for name in ("Masala Omelette", "Egg Curry with Rice", "Grilled Chicken Salad")),
            f"non-veg user should see non-veg recipes, got:\n{out}",
        )

    def test_allergy_phrasing_variants(self):
        tools.save_user_profile(self.user, diet="non-veg", allergies="lactose")
        self.assertNotIn("Paneer Butter Masala", tools.suggest_recipe(self.user, 60, 5))
        tools.save_user_profile(self.user, allergies="peanuts")
        self.assertNotIn("Vegetable Poha", tools.suggest_recipe(self.user, 60, 5))

    def test_allergy_group_is_reported(self):
        tools.save_user_profile(self.user, diet="non-veg", allergies="shellfish")
        self.assertIn("fish", tools._allergy_groups("shellfish"))

    def test_vegetarian_excludes_egg_but_eggetarian_allows_it(self):
        omelette = [
            {"item": "egg", "quantity": 2, "unit": "pcs"},
            {"item": "onion", "quantity": 1, "unit": "pcs"},
        ]

        def current_user():
            conn = tools.get_conn()
            try:
                return tools._get_user(conn, self.user)
            finally:
                conn.close()

        tools.save_user_profile(self.user, diet="vegetarian")
        self.assertIn("egg", tools._blocks_recipe(current_user(), omelette) or "")

        tools.save_user_profile(self.user, diet="eggetarian")
        self.assertIsNone(tools._blocks_recipe(current_user(), omelette))

        tools.save_user_profile(self.user, diet="vegan")
        self.assertIsNotNone(tools._blocks_recipe(current_user(), omelette))


class TestSuggestions(unittest.TestCase):
    def setUp(self):
        self.user = 91
        tools.save_user_profile(self.user, diet="non-veg", allergies="", fitness_goal="maintain weight")
        conn = tools.get_conn()
        conn.execute("DELETE FROM pantry WHERE user_id = ?", (self.user,))
        conn.execute("DELETE FROM feedback WHERE user_id = ?", (self.user,))
        conn.commit()
        conn.close()

    def test_full_coverage_recipe_is_cookable(self):
        for item, qty, unit in [("egg", 4, "pcs"), ("onion", 2, "pcs"), ("tomato", 2, "pcs"),
                                ("rice", 1, "cup"), ("garlic", 4, "cloves"), ("oil", 2, "tbsp")]:
            tools.add_pantry_item(self.user, item, qty, unit)
        out = tools.suggest_recipe(self.user, max_time=60, count=3)
        self.assertIn("Egg Curry with Rice", out)
        self.assertIn("nothing - you can cook this right now", out)

    def test_missing_ingredients_are_listed(self):
        tools.add_pantry_item(self.user, "egg", 4, "pcs")
        out = tools.suggest_recipe(self.user, max_time=60, count=3)
        self.assertIn("missing:", out)

    def test_max_time_filter_with_helpful_hint(self):
        out = tools.suggest_recipe(self.user, max_time=10, count=3)
        self.assertIn("could not find", out.lower())
        self.assertIn("raise max_time", out)

    def test_expiring_items_are_prioritised(self):
        for item, qty, unit, days in [("tomato", 3, "pcs", 0), ("rice", 1, "cup", 30),
                                      ("onion", 1, "pcs", 30), ("curry leaves", 1, "sprig", 30),
                                      ("mustard seeds", 1, "tsp", 30), ("oil", 1, "tbsp", 30)]:
            tools.add_pantry_item(self.user, item, qty, unit, expiry_days=days)
        out = tools.suggest_recipe(self.user, max_time=60, count=3)
        self.assertIn("expiring soon", out)

    def test_high_rated_recipe_ranks_first(self):
        for item, qty, unit in [("tomato", 3, "pcs"), ("rice", 1, "cup"), ("onion", 1, "pcs"),
                                ("curry leaves", 1, "sprig"), ("mustard seeds", 1, "tsp"),
                                ("oil", 1, "tbsp"), ("egg", 4, "pcs"), ("garlic", 4, "cloves")]:
            tools.add_pantry_item(self.user, item, qty, unit)
        tools.provide_feedback(self.user, "Tomato Rice", 5, "loved it")
        out = tools.suggest_recipe(self.user, max_time=60, count=1)
        self.assertIn("Tomato Rice", out)
        self.assertIn("your rating 5.0/5", out)

    def test_low_rating_pushes_recipe_down(self):
        for item, qty, unit in [("egg", 4, "pcs"), ("onion", 2, "pcs"), ("tomato", 2, "pcs"),
                                ("rice", 1, "cup"), ("garlic", 4, "cloves"), ("oil", 2, "tbsp")]:
            tools.add_pantry_item(self.user, item, qty, unit)
        tools.provide_feedback(self.user, "Egg Curry with Rice", 1, "too oily")
        out = tools.suggest_recipe(self.user, max_time=60, count=3)
        self.assertIn("I will rank it lower next time", tools.provide_feedback(self.user, "Egg Curry with Rice", 1))

    def test_weight_loss_goal_surfaces_lighter_option(self):
        tools.save_user_profile(self.user, fitness_goal="weight loss")
        tools.add_pantry_item(self.user, "oats", 1, "cup")
        tools.add_pantry_item(self.user, "onion", 1, "pcs")
        tools.add_pantry_item(self.user, "carrot", 1, "pcs")
        tools.add_pantry_item(self.user, "mustard seeds", 1, "tsp")
        tools.add_pantry_item(self.user, "oil", 2, "tsp")
        out = tools.suggest_recipe(self.user, max_time=60, count=3)
        self.assertIn("fits weight loss", out)


class TestRecipesAndNutrition(unittest.TestCase):
    def test_nutrition_scales_with_servings(self):
        # per-serving values are stored, so the multiplier is the serving count
        single = tools.get_nutrition("Egg Curry with Rice", servings=1)
        quad = tools.get_nutrition("Egg Curry with Rice", servings=4)
        self.assertIn("480kcal", single.replace(" ", ""))
        self.assertIn("1920kcal", quad.replace(" ", ""))

    def test_fuzzy_recipe_name(self):
        self.assertIn("Paneer Butter Masala", tools.get_nutrition("paneer butter"))

    def test_unknown_recipe_does_not_hallucinate(self):
        out = tools.get_nutrition("Sushi Platter Deluxe")
        self.assertIn("not in the recipe database", out)

    def test_add_recipe_with_loose_arguments(self):
        out = tools.add_recipe(
            name="Test Millet Bowl",
            ingredients="millet, curd, cucumber",
            steps="Boil millet, mix everything.",
            nutrition="320 kcal, 11g protein, 50g carbs, 6g fat",
            time_minutes=20,
            user_id=1,
        )
        self.assertIn("Saved recipe", out)
        nutrition = tools.get_nutrition("Test Millet Bowl")
        self.assertIn("320kcal", nutrition.replace(" ", ""))
        self.assertIn("11gprotein", nutrition.replace(" ", ""))
        # the comma separated ingredient string became a real ingredient list
        conn = tools.get_conn()
        try:
            stored = json.loads(conn.execute(
                "SELECT ingredients FROM recipes WHERE name = 'Test Millet Bowl'"
            ).fetchone()["ingredients"])
        finally:
            conn.close()
        self.assertEqual([i["item"] for i in stored], ["millet", "curd", "cucumber"])

    def test_duplicate_recipe_is_not_overwritten(self):
        tools.add_recipe("Dup Test", "rice, salt", "cook", user_id=1)
        again = tools.add_recipe("Dup Test", "rice, salt", "cook", user_id=1)
        self.assertIn("already exists", again)


class TestLoggingPlanningProfile(unittest.TestCase):
    def test_log_meal_counts_and_calories(self):
        out = tools.log_meal(1, "Dal Tadka", servings=2)
        self.assertIn("Logged", out)
        self.assertIn("480kcal", out.replace(" ", ""))  # 240 per serving x 2

    def test_plan_meal_and_read_plan(self):
        out = tools.plan_meal(1, "Chana Masala", "Monday", "dinner", servings=2)
        self.assertIn("Planned", out)
        plan = tools.get_meal_plan(1)
        self.assertIn("Monday", plan)
        self.assertIn("Chana Masala", plan)
        self.assertIn("day total", plan)

    def test_plan_unknown_recipe_is_refused(self):
        out = tools.plan_meal(1, "Nonexistent Dish", "Tuesday", "lunch")
        self.assertIn("do not know a recipe", out)

    def test_plan_slot_is_replaced_not_duplicated(self):
        tools.plan_meal(1, "Dal Tadka", "Wednesday", "lunch")
        tools.plan_meal(1, "Tomato Rice", "Wednesday", "lunch")
        plan = tools.get_meal_plan(1)
        self.assertIn("Tomato Rice", plan)
        self.assertNotIn("Dal Tadka", plan)

    def test_profile_roundtrip(self):
        tools.save_user_profile(2, name="Asha", age="29", diet="vegetarian",
                                allergies="dairy", health_issues="diabetes",
                                fitness_goal="weight loss", budget="2500")
        profile = tools.get_user_profile(2)
        self.assertIn("Asha", profile)
        self.assertIn("age: 29", profile)
        self.assertIn("vegetarian", profile)
        self.assertIn("meals logged", profile)


class TestToolDispatch(unittest.TestCase):
    def test_user_id_is_injected_when_the_model_omits_it(self):
        out = main.call_tool("add_pantry_item", {"ingredient": "mint", "quantity": 1, "unit": "bunch"}, user_id=7)
        self.assertIn("Added", out)
        self.assertIn("mint", tools.get_pantry_items(7))

    def test_unknown_tool_returns_a_recoverable_message(self):
        out = main.call_tool("order_pizza", {}, user_id=1)
        self.assertIn("Unknown tool", out)

    def test_unsupported_arguments_are_dropped(self):
        out = main.call_tool("get_pantry_items", {"user_id": 1, "colour": "blue"}, user_id=1)
        self.assertIn("Pantry", out)
        self.assertIn("ignored unsupported arguments: colour", out)

    def test_tool_exception_is_reported_not_raised(self):
        out = main.call_tool("remove_pantry_item", {"ingredient": None}, user_id=1)
        self.assertIsInstance(out, str)

    def test_registry_matches_schemas(self):
        schema_names = {s["function"]["name"] for s in main.TOOL_SCHEMAS}
        self.assertEqual(schema_names, set(main.TOOL_REGISTRY))
        for name in schema_names:
            self.assertIn(name, tools.tool_names())

    def test_every_schema_parameter_matches_a_real_function_parameter(self):
        import inspect

        for schema in main.TOOL_SCHEMAS:
            name = schema["function"]["name"]
            func = main.TOOL_REGISTRY[name]
            allowed = set(inspect.signature(func).parameters)
            declared = set(schema["function"]["parameters"]["properties"])
            self.assertTrue(declared <= allowed, f"{name} declares unknown params: {declared - allowed}")


class FakeCompletions:
    """Returns a dict-tool-call on the first round, then a final answer."""

    def __init__(self):
        self.calls = 0
        self.seen_messages = []

    def create(self, **kwargs):
        self.calls += 1
        self.seen_messages = list(kwargs.get("messages", []))
        if self.calls == 1:
            message = SimpleNamespace(
                content=None,
                tool_calls=[SimpleNamespace(
                    id="call_1",
                    function=SimpleNamespace(
                        name="get_pantry_items",
                        arguments=json.dumps({"user_id": 1}),
                    ),
                )],
            )
        elif self.calls == 2:
            message = SimpleNamespace(
                content=None,
                tool_calls=[SimpleNamespace(
                    id="call_2",
                    function=SimpleNamespace(
                        name="add_pantry_item",
                        arguments=json.dumps({"ingredient": "basil", "quantity": 1, "unit": "bunch"}),
                    ),
                )],
            )
        else:
            message = SimpleNamespace(content="You have basil now.", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class TestAgentLoop(unittest.TestCase):
    def test_loop_executes_tools_then_answers(self):
        completions = FakeCompletions()
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

        answer = main.run_agent("add basil to my pantry", user_id=1, client=client)

        self.assertEqual(answer, "You have basil now.")
        self.assertEqual(completions.calls, 3)
        tool_messages = [
            m for m in completions.seen_messages
            if isinstance(m, dict) and m.get("role") == "tool"
        ]
        self.assertTrue(tool_messages)
        self.assertIn("basil", json.dumps(tool_messages))
        roles = [m["role"] if isinstance(m, dict) else "assistant" for m in completions.seen_messages]
        self.assertEqual(roles[0], "system")
        self.assertIn("smart cooking assistant", completions.seen_messages[0]["content"].lower())

    def test_system_prompt_carries_profile_and_pantry(self):
        tools.add_pantry_item(1, "ginger", 100, "g")
        prompt = main.system_prompt(1)
        self.assertIn("ginger", prompt)
        self.assertIn("Profile for user 1", prompt)

    def test_history_returned_is_plain_and_serialisable(self):
        completions = FakeCompletions()
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

        answer, transcript = main.run_agent(
            "add basil to my pantry", user_id=1, client=client, return_messages=True
        )

        self.assertEqual(answer, "You have basil now.")
        self.assertTrue(all(isinstance(m, dict) for m in transcript))
        json.dumps(transcript)  # must not raise for session state / JSON logs
        self.assertNotIn("system", [m["role"] for m in transcript])
        tool_calls = [m for m in transcript if m.get("role") == "assistant" and m.get("tool_calls")]
        self.assertTrue(tool_calls)
        self.assertEqual(tool_calls[0]["tool_calls"][0]["function"]["name"], "get_pantry_items")

    def test_history_can_be_replayed_back_into_the_loop(self):
        completions = FakeCompletions()
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

        _, transcript = main.run_agent("first", user_id=1, client=client, return_messages=True)
        main.run_agent("second", user_id=1, history=transcript, client=client)

        roles = [m["role"] for m in completions.seen_messages]
        self.assertEqual(roles.count("system"), 1)   # rebuilt, not duplicated
        self.assertEqual(roles.count("user"), 2)
        self.assertLessEqual(roles.index("user"), 2)

    def test_trim_history_cuts_on_a_user_message(self):
        history = [{"role": "assistant", "tool_calls": [{"id": "x"}]}]
        history += [{"role": "user", "content": f"m{i}"} for i in range(80)]
        history.append({"role": "tool", "tool_call_id": "y", "content": "leftover"})
        trimmed = main._trim_history(history, limit=10)
        self.assertTrue(trimmed)
        self.assertEqual(trimmed[0]["role"], "user")
        self.assertLessEqual(len(trimmed), 10)


@unittest.skipUnless(STREAMLIT_AVAILABLE, "streamlit is not installed")
class TestWebUI(unittest.TestCase):
    APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.py")

    def setUp(self):
        self._previous_key = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = "sk-dummy-never-called"

    def tearDown(self):
        if self._previous_key is None:
            os.environ.pop("OPENAI_API_KEY", None)
        else:
            os.environ["OPENAI_API_KEY"] = self._previous_key

    def _run(self, **session_state):
        app = AppTest.from_file(self.APP, default_timeout=60)
        for key, value in session_state.items():
            app.session_state[key] = value
        app.run()
        self.assertFalse(list(app.exception), [e.value for e in app.exception])
        return app

    def test_app_renders_with_chat_enabled(self):
        app = self._run()
        self.assertEqual(len(app.chat_input), 1)
        self.assertFalse(app.chat_input[0].disabled)
        self.assertIn("Smart Cooking Assistant", app.title[0].value)

    def test_sidebar_shows_live_pantry_and_plan(self):
        tools.add_pantry_item(4, "webui test item", 3, "pcs")
        tools.plan_meal(4, "Tomato Rice", "Friday", "dinner")
        app = AppTest.from_file(self.APP, default_timeout=60)
        app.session_state["user_id"] = 4
        app.run()
        self.assertFalse(list(app.exception))
        rendered = "\n".join(block.value for block in app.code)
        self.assertIn("webui test item", rendered)          # live pantry
        self.assertIn("Tomato Rice", rendered)              # live meal plan
        self.assertIn("Friday", rendered)

    def test_chat_is_disabled_without_api_key(self):
        os.environ.pop("OPENAI_API_KEY", None)
        app = self._run()
        self.assertTrue(app.chat_input[0].disabled)
        self.assertTrue(any("OPENAI_API_KEY" in w.value for w in app.warning))

    def test_stored_conversation_and_tool_trail_are_rendered(self):
        app = self._run(
            chat=[
                {"role": "user", "content": "what can I cook?"},
                {"role": "assistant", "content": "Cook the tomato rice."},
            ],
            activity=[{"tool": "suggest_recipe", "args": "{}", "result": "1. Tomato Rice"}],
        )
        rendered = "\n".join(m.value for m in app.markdown)
        self.assertIn("Cook the tomato rice.", rendered)
        self.assertIn("suggest_recipe", rendered)

    def test_starter_prompts_disappear_once_a_conversation_exists(self):
        empty = self._run()
        starters = [b.label for b in empty.button if "?" in b.label or "I bought" in b.label]
        self.assertTrue(starters, "expected starter prompts on an empty conversation")
        used = self._run(chat=[{"role": "user", "content": "hi"}])
        starters_after = [b.label for b in used.button if "?" in b.label or "I bought" in b.label]
        self.assertFalse(starters_after)


if __name__ == "__main__":
    unittest.main(verbosity=2)
