#!/usr/bin/env python3
"""Smart Cooking Assistant - an agentic AI built on OpenAI function calling.

The model decides which tools to call, we execute them against SQLite, feed the
results back, and loop until it produces a final answer.

Usage:
    python main.py                       # interactive chat
    python main.py --once "add 2 eggs"   # single turn, then exit
    python main.py --user 2              # act as a different user
    python main.py --reset               # wipe the local database first
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
import sys
from datetime import date
from typing import Any, Callable, Dict, List, Optional

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass

import tools

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
MAX_TOOL_ROUNDS = 8
MAX_HISTORY_MESSAGES = 60

# ---------------------------------------------------------------------------
# Tool registry: name -> python callable
# ---------------------------------------------------------------------------
TOOL_REGISTRY: Dict[str, Callable[..., str]] = {
    "add_pantry_item": tools.add_pantry_item,
    "get_pantry_items": tools.get_pantry_items,
    "remove_pantry_item": tools.remove_pantry_item,
    "suggest_recipe": tools.suggest_recipe,
    "add_recipe": tools.add_recipe,
    "get_nutrition": tools.get_nutrition,
    "log_meal": tools.log_meal,
    "provide_feedback": tools.provide_feedback,
    "plan_meal": tools.plan_meal,
    "get_meal_plan": tools.get_meal_plan,
    "get_user_profile": tools.get_user_profile,
    "save_user_profile": tools.save_user_profile,
}


def _schema(name: str, description: str, properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


TOOL_SCHEMAS: List[Dict[str, Any]] = [
    _schema(
        "add_pantry_item",
        "Add an ingredient the user bought to their pantry. If the same ingredient and unit "
        "already exist the quantity is topped up instead of duplicated.",
        {
            "user_id": {"type": "integer", "description": "User id. Omit to use the current user."},
            "ingredient": {"type": "string", "description": "Ingredient name, e.g. 'tomato'"},
            "quantity": {"type": "number", "description": "Amount, e.g. 500"},
            "unit": {"type": "string", "description": "Unit, e.g. g, kg, pcs, cups, tbsp"},
            "expiry_days": {"type": "integer", "description": "Days until it expires. Default 7."},
        },
        ["ingredient", "quantity", "unit"],
    ),
    _schema(
        "get_pantry_items",
        "List everything in the pantry, with ids, quantities and expiry warnings. "
        "Call this before suggesting recipes when you are unsure what the user has.",
        {"user_id": {"type": "integer"}},
        [],
    ),
    _schema(
        "remove_pantry_item",
        "Remove an ingredient from the pantry, or deduct a specific quantity after cooking.",
        {
            "user_id": {"type": "integer"},
            "ingredient": {"type": "string"},
            "quantity": {"type": "number", "description": "Omit to remove the ingredient entirely."},
        },
        ["ingredient"],
    ),
    _schema(
        "suggest_recipe",
        "Rank recipes the user can cook now, honouring diet, allergies, time limit, pantry "
        "contents, items about to expire, past ratings and their fitness goal.",
        {
            "user_id": {"type": "integer"},
            "max_time": {"type": "integer", "description": "Maximum cooking time in minutes. Default 30."},
            "count": {"type": "integer", "description": "How many suggestions. Default 3."},
        },
        [],
    ),
    _schema(
        "add_recipe",
        "Save a new recipe so it can be planned, cooked and rated. Use this when the user "
        "describes a dish that is not in the database yet.",
        {
            "user_id": {"type": "integer"},
            "name": {"type": "string"},
            "ingredients": {
                "description": "JSON array like [{\"item\":\"egg\",\"quantity\":2,\"unit\":\"pcs\"}] "
                               "or a simple comma separated string like 'egg, onion, tomato'.",
            },
            "steps": {"type": "string"},
            "cooking_method": {"type": "string", "description": "e.g. pan-fry, simmer, grill, no-cook"},
            "time_minutes": {"type": "integer"},
            "servings": {"type": "integer"},
            "nutrition": {
                "description": "Either an object {\"kcal\":350,\"protein_g\":15,\"carbs_g\":40,\"fat_g\":10} "
                               "or text like '350 kcal, 15g protein, 40g carbs, 10g fat'.",
            },
        },
        ["name", "ingredients", "steps"],
    ),
    _schema(
        "get_nutrition",
        "Nutrition breakdown for a recipe, scaled to the number of servings. "
        "Returns 'unknown' rather than guessing when the recipe is not stored.",
        {
            "recipe_name": {"type": "string"},
            "servings": {"type": "integer", "description": "Default 1."},
        },
        ["recipe_name"],
    ),
    _schema(
        "log_meal",
        "Record a meal the user actually cooked.",
        {
            "user_id": {"type": "integer"},
            "recipe_name": {"type": "string"},
            "servings": {"type": "integer", "description": "Default 1."},
            "cooked_on": {"type": "string", "description": "YYYY-MM-DD. Defaults to today."},
        },
        ["recipe_name"],
    ),
    _schema(
        "provide_feedback",
        "Store the user's rating for a meal so future suggestions prefer what they liked.",
        {
            "user_id": {"type": "integer"},
            "recipe_name": {"type": "string"},
            "rating": {"type": "integer", "description": "1 to 5"},
            "notes": {"type": "string"},
            "quantity": {"type": "string", "description": "How much they ate, e.g. '1 bowl'"},
        },
        ["recipe_name", "rating"],
    ),
    _schema(
        "plan_meal",
        "Add a recipe to the weekly meal plan, replacing anything already in that slot.",
        {
            "user_id": {"type": "integer"},
            "recipe_name": {"type": "string"},
            "day": {"type": "string", "description": "Monday, Tuesday, ..."},
            "meal_slot": {"type": "string", "description": "breakfast, lunch or dinner"},
            "servings": {"type": "integer"},
            "week_start": {"type": "string", "description": "YYYY-MM-DD Monday. Defaults to this week."},
        },
        ["recipe_name", "day"],
    ),
    _schema(
        "get_meal_plan",
        "Show the weekly plan with per-day calorie totals.",
        {
            "user_id": {"type": "integer"},
            "week_start": {"type": "string"},
        },
        [],
    ),
    _schema(
        "get_user_profile",
        "Read the user's diet, allergies, health issues, fitness goal, budget and activity totals.",
        {"user_id": {"type": "integer"}},
        [],
    ),
    _schema(
        "save_user_profile",
        "Create or update the user profile. Only send the fields that changed. "
        "Allergies and diet here control the recipe filter.",
        {
            "user_id": {"type": "integer"},
            "name": {"type": "string"},
            "age": {"type": "integer"},
            "gender": {"type": "string"},
            "location": {"type": "string"},
            "diet": {"type": "string", "description": "vegan, vegetarian (no egg), eggetarian (eggs allowed), or non-veg"},
            "allergies": {"type": "string", "description": "e.g. 'peanuts, dairy'"},
            "health_issues": {"type": "string", "description": "e.g. 'diabetes'"},
            "fitness_goal": {"type": "string", "description": "e.g. 'weight loss', 'muscle gain'"},
            "budget": {"type": "number"},
        },
        [],
    ),
]


# ---------------------------------------------------------------------------
# agent loop
# ---------------------------------------------------------------------------
def call_tool(name: str, arguments: Dict[str, Any], user_id: int) -> str:
    """Run one tool, defensively.

    The model may invent arguments or omit user_id, so arguments are filtered
    against the real function signature and failures come back as text the
    model can recover from instead of crashing the loop.
    """
    func = TOOL_REGISTRY.get(name)
    if func is None:
        return f"Unknown tool '{name}'. Available tools: {', '.join(TOOL_REGISTRY)}"

    params = inspect.signature(func).parameters
    kwargs = {k: v for k, v in (arguments or {}).items() if k in params}
    if "user_id" in params and not kwargs.get("user_id"):
        kwargs["user_id"] = user_id
    dropped = set(arguments or {}) - set(kwargs)
    if dropped:
        kwargs.setdefault("_unused", None)
        kwargs.pop("_unused", None)

    try:
        result = func(**kwargs)
    except TypeError as exc:
        return f"Tool '{name}' was called with the wrong arguments ({exc})."
    except Exception as exc:  # keep the conversation alive
        return f"Tool '{name}' failed: {type(exc).__name__}: {exc}"

    note = f" (ignored unsupported arguments: {', '.join(sorted(dropped))})" if dropped else ""
    return f"{result}{note}"


def system_prompt(user_id: int) -> str:
    """Give the model the profile and a live pantry snapshot up front."""
    profile = tools.get_user_profile(user_id)
    pantry = tools.get_pantry_items(user_id)
    return (
        "You are the Smart Cooking Assistant, a practical agentic assistant for home cooking.\n"
        "You manage the pantry, suggest recipes, plan the week, log meals and track nutrition.\n\n"
        "How to behave:\n"
        "- Use the tools for anything about pantry, recipes, plans, logs or nutrition. Never invent "
        "pantry contents or nutrition numbers.\n"
        "- Before suggesting food, check the pantry so suggestions match what is actually at home.\n"
        f"- Today is {date.today().isoformat()}. Prefer recipes that use ingredients expiring soon.\n"
        "- Respect the user's diet and allergies absolutely; the tools already filter, but never "
        "recommend something the profile rules out.\n"
        "- Keep answers short and concrete: name the dish, the time, what is missing, the calories.\n\n"
        f"Current user id: {user_id}\n"
        f"{profile}\n\n"
        f"{pantry}"
    )


def _message_to_dict(message: Any) -> Dict[str, Any]:
    """Normalise an SDK message object into a plain dict.

    Keeping the transcript as dicts means it stays serialisable, so the
    Streamlit UI can hold it in session state and pass it back next turn.
    """
    if isinstance(message, dict):
        return message

    tool_calls = getattr(message, "tool_calls", None)
    data: Dict[str, Any] = {"role": getattr(message, "role", "assistant")}
    content = getattr(message, "content", None)
    data["content"] = "" if content is None else (
        content if isinstance(content, str) else json.dumps(content, default=str)
    )
    if tool_calls:
        data["tool_calls"] = [
            {
                "id": getattr(call, "id", None),
                "type": getattr(call, "type", None) or "function",
                "function": {
                    "name": getattr(getattr(call, "function", None), "name", None),
                    "arguments": getattr(getattr(call, "function", None), "arguments", None) or "{}",
                },
            }
            for call in tool_calls
        ]
    return data


def _trim_history(history: List[Dict[str, Any]], limit: int = MAX_HISTORY_MESSAGES) -> List[Dict[str, Any]]:
    """Drop old turns, cutting on a user message so tool calls stay paired."""
    if len(history) <= limit:
        return list(history)
    start = len(history) - limit
    while start < len(history) and history[start].get("role") != "user":
        start += 1
    return list(history[start:]) if start < len(history) else []


def run_agent(
    user_message: str,
    user_id: int = 1,
    history: Optional[List[Dict[str, Any]]] = None,
    client: Any = None,
    verbose: bool = False,
    return_messages: bool = False,
) -> Any:
    """Run one conversational turn, executing tool calls until the model answers.

    With return_messages=True returns (answer, transcript) where the transcript
    is dict-only and excludes the system message, so a UI can store it and pass
    it straight back as `history` next turn.
    """
    if client is None:
        client = _build_client()

    # The system prompt is rebuilt every turn so the pantry snapshot stays fresh.
    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt(user_id)}]
    messages.extend(_trim_history(list(history or [])))
    messages.append({"role": "user", "content": user_message})

    answer = None
    for round_number in range(1, MAX_TOOL_ROUNDS + 1):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
        )
        message = response.choices[0].message
        messages.append(_message_to_dict(message))

        tool_calls = getattr(message, "tool_calls", None)
        if not tool_calls:
            answer = message.content or "(the model returned an empty answer)"
            break

        for tool_call in tool_calls:
            name = tool_call.function.name
            raw_args = tool_call.function.arguments or "{}"
            try:
                arguments = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                arguments = {}
            result = call_tool(name, arguments, user_id)
            if verbose:
                print(f"  [tool] {name}({json.dumps(arguments, default=str)}) -> {result.splitlines()[0][:120]}")
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })
    else:
        answer = "I hit my tool-call limit for one turn. Could you break that request into smaller steps?"

    if return_messages:
        return answer, [m for m in messages if m.get("role") != "system"]
    return answer


def _build_client() -> Any:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or api_key == "your_openai_api_key_here":
        print(
            "No OPENAI_API_KEY found.\n"
            "  1. cp .env.example .env\n"
            "  2. Put your key in .env\n"
            "Run `python test_tools.py` to verify the tool layer without a key.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    try:
        from openai import OpenAI
    except ImportError:
        print("The openai package is missing. Run: pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(1)
    return OpenAI(api_key=api_key)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Smart Cooking Assistant agent")
    parser.add_argument("--user", type=int, default=1, help="user id to act as")
    parser.add_argument("--once", metavar="MESSAGE", help="run a single turn and exit")
    parser.add_argument("--reset", action="store_true", help="delete the local database first")
    parser.add_argument("--verbose", action="store_true", help="print each tool call")
    args = parser.parse_args()

    if args.reset:
        path = tools.db_path()
        if os.path.exists(path):
            os.remove(path)
            print(f"Removed {path}")

    path = tools.init_db(seed=True)
    print(f"Cooking Assistant Agent ready (database: {path}, user {args.user}).")

    if args.once:
        print(f"\nYou: {args.once}")
        print(f"Agent: {run_agent(args.once, user_id=args.user, verbose=args.verbose)}")
        return

    client = _build_client()
    history: List[Dict[str, Any]] = []
    print("Type 'quit' to exit, 'reset' to clear the conversation.\n")
    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if user_input.lower() in {"quit", "exit"}:
            break
        if user_input.lower() == "reset":
            history = []
            print("Conversation cleared.\n")
            continue
        if not user_input:
            continue
        try:
            answer = run_agent(user_input, user_id=args.user, history=history,
                               client=client, verbose=args.verbose)
        except Exception as exc:
            print(f"Agent error: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        print(f"Agent: {answer}\n")


if __name__ == "__main__":
    main()
