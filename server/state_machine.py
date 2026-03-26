"""
Core state machine engine.
Drives the conversation flow based on the JSON config.
LLM is used ONLY for objection/fallback states.
"""
import json
import os
from pathlib import Path
import anthropic
from dotenv import load_dotenv
GENERAL_SYSTEM_PROMPT = (
    "You are a professional assistant for Evidence Based Advisor Marketing. "
    "Be empathetic, concise, and always guide the conversation positively. "
    "Never give specific financial advice. Keep responses to 2–3 sentences."
)

DEFAULT_OPTION_LLM_PROMPT = (
    "Respond directly and warmly to their question or concern. Keep your response to 2–4 short paragraphs."
)

load_dotenv()

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

DEFAULT_FLOW_PATH = Path(__file__).parent / "flows" / "default_flow.json"
AUDIENCE_FLOW_PATHS = {
    "advisor": Path(__file__).parent / "flows" / "default_flow_advisor.json",
    "cpa":     Path(__file__).parent / "flows" / "default_flow_cpa.json",
}


def load_default_flow(audience: str | None = None) -> dict:
    path = AUDIENCE_FLOW_PATHS.get(audience, DEFAULT_FLOW_PATH) if audience else DEFAULT_FLOW_PATH
    with open(path) as f:
        return json.load(f)


def get_state(flow: dict, state_id: str) -> dict | None:
    return flow.get(state_id)


def _interpolate(text: str, collected_data: dict) -> str:
    """Replace {{variable}} placeholders in bot messages with collected data."""
    if not text:
        return text
    for key, val in collected_data.items():
        text = text.replace(f"{{{{{key}}}}}", str(val))
    return text


async def process_message(
    flow: dict,
    current_state_id: str,
    previous_state_id: str | None,
    user_input: str,
    collected_data: dict,
    system_prompt: str | None = None,
    message_history: list | None = None,
    default_llm_prompt: str | None = None,
) -> dict:
    """
    Process user input and transition to next state.

    Returns:
    {
        "next_state_id": str,
        "bot_message": str,
        "captured_field": str | None,
        "captured_value": str | None,
        "is_end": bool,
        "user_type": str | None,
    }
    """
    state = get_state(flow, current_state_id)
    if not state:
        return _error_response("I'm sorry, something went wrong. Let me start over.", "start")

    state_type = state.get("type")

    # --- PENDING context (set by a previous option's "input" or "sub_choices" mode) ---
    pending = collected_data.get("__pending__")
    if pending and pending.get("state_id") == current_state_id:
        pending_type = pending.get("type")

        if pending_type == "input":
            value = user_input.strip()
            captured = {"__pending__": None}
            if pending.get("capture") and value:
                captured[pending["capture"]] = value
            next_state_id = pending.get("next", "start")
            next_state = get_state(flow, next_state_id)
            return {
                "next_state_id": next_state_id,
                "bot_message": next_state.get("message", ""),
                "bot_options": next_state.get("options"),
                "captured": captured,
                "is_end": next_state.get("type") == "end",
                "user_type": next_state.get("user_type"),
            }

        if pending_type == "sub_choices":
            parent_option = pending.get("parent_option")
            opt_cfg = state.get("option_config", {}).get(parent_option, {})
            sub_options = opt_cfg.get("sub_options", [])
            sub_transitions = opt_cfg.get("sub_transitions", {})

            matched = _match_option(user_input, sub_options)
            if not matched:
                matched = await _smart_match_option(user_input, sub_options)

            if matched:
                next_state_id = sub_transitions.get(matched, state.get("fallback", "start"))
                next_state = get_state(flow, next_state_id)
                capture_field = state.get("capture")
                captured = {"__pending__": None}
                if capture_field:
                    captured[capture_field] = matched
                return {
                    "next_state_id": next_state_id,
                    "bot_message": next_state.get("message", ""),
                    "bot_options": next_state.get("options"),
                    "captured": captured,
                    "is_end": next_state.get("type") == "end",
                    "user_type": next_state.get("user_type"),
                }
            else:
                return {
                    "next_state_id": current_state_id,
                    "bot_message": opt_cfg.get("sub_message", "Please choose one of the options."),
                    "bot_options": sub_options,
                    "captured": {},
                    "is_end": False,
                    "user_type": None,
                }

    # --- CHOICE state ---
    if state_type == "choice":
        options = state.get("options", [])
        transitions = state.get("transitions", {})
        option_config = state.get("option_config", {})
        capture_field = state.get("capture")

        # Step 1: exact match
        matched_option = _match_option(user_input, options)

        # Step 2: if no exact match, try LLM smart mapping
        if not matched_option:
            matched_option = await _smart_match_option(user_input, options)

        if matched_option:
            opt_cfg = option_config.get(matched_option, {})
            mode = opt_cfg.get("mode", "transition")
            captured = {capture_field: matched_option} if capture_field else {}

            # Mode: LLM call on selection
            if mode == "llm":
                selection_context = f"User selected: '{matched_option}'.\nUser message: '{user_input}'\n\n"
                if opt_cfg.get("llm_prompt"):
                    # Custom prompt — use as-is with {{input}} substitution
                    prompt = opt_cfg["llm_prompt"]
                else:
                    # Default prompt — prepend selection context automatically
                    prompt = selection_context + (default_llm_prompt or DEFAULT_OPTION_LLM_PROMPT)
                llm_response = await _call_llm(prompt, user_input, collected_data, system_prompt=system_prompt)
                next_state_id = opt_cfg.get("next") or transitions.get(matched_option, state.get("fallback", "start"))
                next_state = get_state(flow, next_state_id)
                return {
                    "next_state_id": next_state_id,
                    "bot_message": llm_response + ("\n\n" + next_state.get("message", "") if next_state.get("message") else ""),
                    "bot_options": next_state.get("options"),
                    "captured": captured,
                    "is_end": next_state.get("type") == "end",
                    "user_type": next_state.get("user_type"),
                }

            # Mode: show sub-choices
            elif mode == "sub_choices":
                sub_message = opt_cfg.get("sub_message", "Please choose:")
                sub_options = opt_cfg.get("sub_options", [])
                captured["__pending__"] = {"type": "sub_choices", "state_id": current_state_id, "parent_option": matched_option}
                return {
                    "next_state_id": current_state_id,
                    "bot_message": sub_message,
                    "bot_options": sub_options,
                    "captured": captured,
                    "is_end": False,
                    "user_type": None,
                }

            # Mode: ask for free-text input after selection
            elif mode == "input":
                input_message = opt_cfg.get("input_message") or f"Could you tell us more about '{matched_option}'?"
                captured["__pending__"] = {
                    "type": "input",
                    "state_id": current_state_id,
                    "parent_option": matched_option,
                    "capture": opt_cfg.get("capture"),
                    "next": opt_cfg.get("next") or transitions.get(matched_option, state.get("fallback", "start")),
                }
                return {
                    "next_state_id": current_state_id,
                    "bot_message": input_message,
                    "bot_options": None,
                    "captured": captured,
                    "is_end": False,
                    "user_type": None,
                }

            # Mode: normal transition (default)
            else:
                next_state_id = transitions.get(matched_option, state.get("fallback", "start"))
                next_state = get_state(flow, next_state_id)
                return {
                    "next_state_id": next_state_id,
                    "bot_message": next_state.get("message", ""),
                    "bot_options": next_state.get("options"),
                    "captured": captured,
                    "is_end": next_state.get("type") == "end",
                    "user_type": next_state.get("user_type"),
                }
        else:
            # Genuine objection / off-topic → fallback
            fallback_id = state.get("fallback", "handle_objection")
            return await _handle_fallback(flow, fallback_id, user_input, current_state_id, system_prompt=system_prompt)

    # --- INPUT state ---
    elif state_type == "input":
        capture_field = state.get("capture")
        next_state_id = state.get("next", "start")
        is_optional = state.get("optional", False)

        # Accept "skip" or empty for optional fields
        value = user_input.strip()
        if not value and not is_optional:
            return {
                "next_state_id": current_state_id,
                "bot_message": "Please provide a response to continue.",
                "bot_options": None,
                "captured": {},
                "is_end": False,
                "user_type": None,
            }

        # Email validation
        if capture_field == "email" and value:
            import re
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
                return {
                    "next_state_id": current_state_id,
                    "bot_message": "That doesn't look like a valid email address. Could you double-check and try again?",
                    "bot_options": None,
                    "captured": {},
                    "is_end": False,
                    "user_type": None,
                }

        captured = {capture_field: value} if capture_field and value else {}
        next_state = get_state(flow, next_state_id)
        merged = {**collected_data, **captured}
        return {
            "next_state_id": next_state_id,
            "bot_message": _interpolate(next_state.get("message", ""), merged),
            "bot_options": next_state.get("options"),
            "captured": captured,
            "is_end": next_state.get("type") == "end",
            "user_type": next_state.get("user_type"),
        }

    # --- LLM state ---
    elif state_type == "llm":
        # Check if the user input matches an exit option (e.g. "I'd like to get in touch")
        # Only use exact match here — any free-form text should go to the LLM, not trigger an exit
        exit_options = state.get("options", [])
        exit_transitions = state.get("transitions", {})
        if exit_options:
            matched_exit = _match_option(user_input, exit_options)
            if not matched_exit:
                matched_exit = await _smart_match_option(user_input, exit_options)
            if matched_exit:
                next_state_id = exit_transitions.get(matched_exit, state.get("fallback", "start"))
                next_state = get_state(flow, next_state_id)
                return {
                    "next_state_id": next_state_id,
                    "bot_message": _interpolate(next_state.get("message", ""), collected_data),
                    "bot_options": next_state.get("options"),
                    "captured": {},
                    "is_end": next_state.get("type") == "end",
                    "user_type": next_state.get("user_type"),
                }

        # Call LLM — use full message history for conversational context
        bot_message = await _call_llm(
            state.get("prompt_template", ""),
            user_input,
            collected_data,
            system_prompt=system_prompt,
            message_history=message_history,
        )

        # Determine next state
        configured_next = state.get("next")
        if not configured_next or configured_next == "return_to_previous":
            next_state_id = previous_state_id or "start"
        else:
            next_state_id = configured_next

        is_loop = next_state_id == current_state_id
        next_state = get_state(flow, next_state_id) if not is_loop else None

        return {
            "next_state_id": next_state_id,
            "bot_message": bot_message + (
                ("\n\n" + next_state.get("message", "")) if (next_state and next_state.get("message")) else ""
            ),
            # Stay in loop → show the exit options; otherwise show next state options
            "bot_options": exit_options if is_loop else (next_state.get("options") if next_state else None),
            "captured": {},
            "is_end": False if is_loop else (next_state.get("type") == "end" if next_state else False),
            "user_type": None if is_loop else (next_state.get("user_type") if next_state else None),
        }

    # --- END state (should not receive input, but handle gracefully) ---
    elif state_type == "end":
        return {
            "next_state_id": current_state_id,
            "bot_message": _interpolate(state.get("message", "Thank you!"), collected_data),
            "bot_options": None,
            "captured": {},
            "is_end": True,
            "user_type": state.get("user_type"),
        }

    return _error_response("I'm sorry, I didn't understand that.", current_state_id)


def get_initial_message(flow: dict) -> dict:
    """Return the opening state message for a new session."""
    start = get_state(flow, "start")
    return {
        "next_state_id": "start",
        "bot_message": start.get("message", "Hello! How can I help you today?"),
        "bot_options": start.get("options"),
        "captured": {},
        "is_end": False,
        "user_type": None,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _match_option(user_input: str, options: list[str]) -> str | None:
    """Case-insensitive exact match against available options."""
    lowered = user_input.strip().lower()
    for opt in options:
        if opt.lower() == lowered:
            return opt
    return None


async def _smart_match_option(user_input: str, options: list[str]) -> str | None:
    """
    Use LLM to map free-text user input to the closest option.
    Returns the exact option string if matched, None if it is a genuine objection.

    Examples:
      "$50K"            → "Under $100K"
      "around 200k"     → "$100K – $500K"
      "half a million"  → "$500K – $1M"
      "retirement"      → "Retirement planning"
      "I don't trust AI"→ None  (genuine objection, not an option)
    """
    options_list = "\n".join(f"- {opt}" for opt in options)
    prompt = (
        f"A user was shown these choices:\n{options_list}\n\n"
        f"Instead of clicking, the user typed: \"{user_input}\"\n\n"
        f"Your job: decide if their typed reply is clearly expressing one of the options above.\n"
        f"Examples of valid mappings:\n"
        f"  '$50K' or '50 thousand' → 'Under $100K'\n"
        f"  '200k' or 'around 200 thousand' → '$100K – $500K'\n"
        f"  'half a million' → '$500K – $1M'\n"
        f"  'retirement' → 'Retirement planning'\n"
        f"  'I am an investor' → 'I need financial advice'\n\n"
        f"IMPORTANT RULES:\n"
        f"  - If their reply is a question (contains '?', starts with how/what/why/when/where/can/is/do/will), respond with NONE.\n"
        f"  - If their reply is an objection, concern, complaint, or clearly unrelated, respond with NONE.\n"
        f"  - Only map to an option if the user is CLEARLY and UNAMBIGUOUSLY selecting that exact option.\n"
        f"  - For options like 'I'd like to get in touch', only match if the user explicitly says they want contact/callback/consultation — NOT if they're asking a question about trust, pricing, or anything else.\n\n"
        f"If their reply maps to an option, respond with ONLY the exact option text.\n"
        f"Otherwise, respond with NONE."
    )
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=30,
            messages=[{"role": "user", "content": prompt}],
        )
        result = response.content[0].text.strip()
        if result.upper() == "NONE":
            return None
        # Case-insensitive match to handle minor LLM formatting differences
        result_lower = result.lower()
        for opt in options:
            if opt.lower() == result_lower:
                return opt
        return None
    except Exception:
        return None


async def _handle_fallback(flow: dict, fallback_id: str, user_input: str, current_state_id: str, system_prompt: str | None = None) -> dict:
    fallback_state = get_state(flow, fallback_id)
    if not fallback_state:
        current = get_state(flow, current_state_id)
        return {
            "next_state_id": current_state_id,
            "bot_message": current.get("message", "Please choose one of the options."),
            "bot_options": current.get("options"),
            "captured": {},
            "is_end": False,
            "user_type": None,
        }

    if fallback_state.get("type") == "llm":
        bot_message = await _call_llm(
            fallback_state.get("prompt_template", ""),
            user_input,
            {},
            system_prompt=system_prompt,
        )
        # Re-show the current state after LLM response
        current = get_state(flow, current_state_id)
        return {
            "next_state_id": current_state_id,
            "bot_message": bot_message + "\n\n" + current.get("message", ""),
            "bot_options": current.get("options"),
            "captured": {},
            "is_end": False,
            "user_type": None,
        }

    return {
        "next_state_id": fallback_id,
        "bot_message": fallback_state.get("message", ""),
        "bot_options": fallback_state.get("options"),
        "captured": {},
        "is_end": fallback_state.get("type") == "end",
        "user_type": fallback_state.get("user_type"),
    }


async def _call_llm(
    prompt_template: str,
    user_input: str,
    collected_data: dict,
    system_prompt: str | None = None,
    message_history: list | None = None,
) -> str:
    # Build messages — use full history for conversational LLM states
    if message_history:
        messages = message_history
    else:
        prompt = prompt_template.replace("{{input}}", user_input)
        for key, val in collected_data.items():
            prompt = prompt.replace(f"{{{{{key}}}}}", str(val))
        messages = [{"role": "user", "content": prompt or user_input}]

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=system_prompt or GENERAL_SYSTEM_PROMPT,
            messages=messages,
        )
        return response.content[0].text.strip()
    except Exception:
        return "I understand your concern. Let me help guide you to the right solution."


def _error_response(message: str, fallback_state_id: str) -> dict:
    return {
        "next_state_id": fallback_state_id,
        "bot_message": message,
        "bot_options": None,
        "captured": {},
        "is_end": False,
        "user_type": None,
    }
