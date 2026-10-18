"""Streamlit web UI for the Smart Cooking Assistant agent.

    streamlit run app.py

Talks to the same agent loop and SQLite database as the CLI, in a browser tab.
The sidebar shows live state straight from the database and includes a profile
form, which is handy for demoing how diet and allergy settings change what the
agent suggests.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import streamlit as st

st.set_page_config(page_title="Smart Cooking Assistant", page_icon="🍳", layout="wide")

# Deployments (e.g. Streamlit Community Cloud) hand the OpenAI key over via
# st.secrets instead of a local .env file, so surface every secret as an
# environment variable too. A missing secrets file is not an error locally.
try:
    for _key, _value in st.secrets.items():
        os.environ.setdefault(str(_key), str(_value))
except FileNotFoundError:
    pass

import main  # noqa: E402
import tools  # noqa: E402

PLACEHOLDER_KEY = "your_openai_api_key_here"
DIET_OPTIONS = ["vegetarian", "eggetarian", "vegan", "non-veg"]
GOAL_OPTIONS = ["maintain weight", "weight loss", "muscle gain"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def api_key_configured() -> bool:
    key = os.environ.get("OPENAI_API_KEY")
    return bool(key) and key != PLACEHOLDER_KEY


@st.cache_resource(show_spinner=False)
def get_client():
    return main._build_client()


def remember_notice(message: str, kind: str = "success") -> None:
    """Queue a message to show after the next rerun."""
    st.session_state.notice = (message, kind)


def render_notice() -> None:
    notice = st.session_state.pop("notice", None)
    if not notice:
        return
    message, kind = notice
    {"success": st.success, "warning": st.warning, "error": st.error}.get(kind, st.info)(message)


def init_state() -> None:
    st.session_state.setdefault("transcript", [])   # dicts sent back to the model
    st.session_state.setdefault("chat", [])         # {"role", "content"} for display
    st.session_state.setdefault("activity", [])     # tool calls from the last turn
    st.session_state.setdefault("user_id", 1)


def run_turn(prompt: str, user_id: int) -> None:
    """Send one message to the agent and store the result."""
    client = get_client()
    prior = len(st.session_state.transcript)
    answer, transcript = main.run_agent(
        prompt,
        user_id=user_id,
        history=st.session_state.transcript,
        client=client,
        return_messages=True,
    )
    st.session_state.transcript = transcript

    # Collect what the agent did during this turn, for the activity panel.
    activity: List[Dict[str, str]] = []
    for message in transcript[prior:]:
        if message.get("role") == "assistant":
            for call in message.get("tool_calls") or []:
                activity.append({
                    "tool": call["function"]["name"],
                    "args": call["function"]["arguments"] or "{}",
                    "result": "",
                })
        elif message.get("role") == "tool" and activity:
            pending = next((a for a in reversed(activity) if not a["result"]), None)
            if pending is not None:
                pending["result"] = (message.get("content") or "").strip()
    st.session_state.activity = activity
    st.session_state.chat.append({"role": "assistant", "content": answer})


# ---------------------------------------------------------------------------
# sidebar - live state and settings
# ---------------------------------------------------------------------------
def render_sidebar() -> int:
    with st.sidebar:
        st.header("Settings")
        user_id = st.number_input("User id", min_value=1, step=1,
                                  value=int(st.session_state.user_id))
        st.session_state.user_id = int(user_id)

        profile = tools.get_user_row(int(user_id))
        diet = profile.get("diet") or "vegetarian"
        goal = profile.get("fitness_goal") or "maintain weight"

        with st.form("profile"):
            st.subheader("Your profile")
            name = st.text_input("Name", value=profile.get("name") or "")
            diet_choice = st.selectbox(
                "Diet", DIET_OPTIONS,
                index=DIET_OPTIONS.index(diet) if diet in DIET_OPTIONS else 0,
                help="'vegetarian' excludes egg. Use 'eggetarian' if you eat eggs.",
            )
            goal_choice = st.selectbox(
                "Goal", GOAL_OPTIONS,
                index=GOAL_OPTIONS.index(goal) if goal in GOAL_OPTIONS else 0,
            )
            allergies = st.text_input("Allergies", value=profile.get("allergies") or "",
                                      placeholder="e.g. peanuts, dairy")
            health = st.text_input("Health issues", value=profile.get("health_issues") or "",
                                   placeholder="e.g. diabetes")
            submitted = st.form_submit_button("Save profile")
        if submitted:
            remember_notice(tools.save_user_profile(
                int(user_id), name=name, diet=diet_choice, allergies=allergies,
                health_issues=health, fitness_goal=goal_choice,
            ))
            st.rerun()

        st.divider()
        st.subheader("Pantry")
        st.code(tools.get_pantry_items(int(user_id)), language=None)

        st.subheader("This week's plan")
        st.code(tools.get_meal_plan(int(user_id)), language=None)

        st.divider()
        if st.button("Clear conversation", use_container_width=True):
            st.session_state.transcript = []
            st.session_state.chat = []
            st.session_state.activity = []
            st.rerun()

        with st.expander("Reset local database"):
            st.caption("Deletes every pantry item, plan and rating. The recipe library is re-seeded.")
            if st.checkbox("Yes, wipe it") and st.button("Reset now"):
                path = tools.db_path()
                if os.path.exists(path):
                    os.remove(path)
                tools.init_db(seed=True)
                st.session_state.transcript = []
                st.session_state.chat = []
                st.session_state.activity = []
                remember_notice("Local database reset and recipes re-seeded.")
                st.rerun()

    return int(user_id)


# ---------------------------------------------------------------------------
# main chat area
# ---------------------------------------------------------------------------
def render_chat(user_id: int) -> None:
    st.title("🍳 Smart Cooking Assistant")
    st.caption(
        "An agentic AI that manages your pantry, suggests recipes you can actually cook, "
        "plans the week and tracks nutrition. It chooses which of its 12 tools to use."
    )

    configured = api_key_configured()
    if not configured:
        st.warning(
            "No `OPENAI_API_KEY` found, so the chat is disabled. "
            "Copy `.env.example` to `.env`, paste your key, and restart. "
            "The sidebar still works, and `python test_tools.py` runs the whole "
            "tool layer offline."
        )

    for message in st.session_state.chat:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    if st.session_state.activity:
        with st.expander(f"What the agent did ({len(st.session_state.activity)} tool call(s))", expanded=False):
            for step in st.session_state.activity:
                st.markdown(f"**`{step['tool']}`** `{step['args']}`")
                st.code(step["result"] or "(no result)", language=None)

    if not st.session_state.chat:
        st.markdown("**Try one of these:**")
        starters = [
            "I bought 4 tomatoes, 2 onions and 1 cup of rice",
            "What can I cook tonight in under 20 minutes?",
            "I'm allergic to peanuts and trying to lose weight",
            "Plan dinners for Monday to Wednesday",
            "I cooked tomato rice, rate it 5 out of 5",
        ]
        columns = st.columns(2)
        for index, starter in enumerate(starters):
            if columns[index % 2].button(starter, key=f"starter_{index}", use_container_width=True):
                st.session_state.chat.append({"role": "user", "content": starter})
                with st.spinner("Thinking..."):
                    try:
                        run_turn(starter, user_id)
                    except Exception as exc:  # surface API errors in the UI
                        st.session_state.chat.append({
                            "role": "assistant",
                            "content": f"Something went wrong: `{type(exc).__name__}: {exc}`",
                        })
                st.rerun()

    prompt = st.chat_input(
        "Ask about your pantry, meals or nutrition...",
        disabled=not configured,
    )
    if prompt:
        st.session_state.chat.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    run_turn(prompt, user_id)
                    st.markdown(st.session_state.chat[-1]["content"])
                except Exception as exc:
                    error = f"Something went wrong: `{type(exc).__name__}: {exc}`"
                    st.session_state.chat.append({"role": "assistant", "content": error})
                    st.error(error)
        st.rerun()


def main_ui() -> None:
    tools.init_db(seed=True)
    init_state()
    render_notice()
    user_id = render_sidebar()
    render_chat(user_id)


main_ui()
