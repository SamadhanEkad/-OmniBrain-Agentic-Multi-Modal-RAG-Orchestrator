from typing import Any

from .state import AgentState


# ============================================================
# Agent names
# ============================================================

SEARCH_AGENT = "search_agent"
SQL_AGENT = "sql_agent"
VISION_AGENT = "vision_agent"


# ============================================================
# Intent classification
# ============================================================

def classify_intent(query: str) -> tuple[str, list[str]]:
    """
    Classify the user's query and determine which specialist
    agent or agents should handle it.

    This is a development-time classifier.

    Later, this can be replaced with an LLM-based structured
    intent classifier.
    """

    text = query.lower().strip()

    visual_keywords = [
        "chart",
        "graph",
        "plot",
        "image",
        "diagram",
        "figure",
        "visual",
        "infographic",
    ]

    sql_keywords = [
        "revenue",
        "profit",
        "loss",
        "sales",
        "growth",
        "percentage",
        "percent",
        "amount",
        "total",
        "average",
        "maximum",
        "minimum",
        "compare",
        "financial",
        "2024",
        "2025",
        "2026",
    ]

    has_visual = any(
        keyword in text
        for keyword in visual_keywords
    )

    has_sql = any(
        keyword in text
        for keyword in sql_keywords
    )

    # --------------------------------------------------------
    # Mixed query
    # --------------------------------------------------------

    if has_visual and has_sql:
        return "mixed", [
            SQL_AGENT,
            VISION_AGENT,
        ]

    # --------------------------------------------------------
    # Visual query
    # --------------------------------------------------------

    if has_visual:
        return "visual", [
            VISION_AGENT,
        ]

    # --------------------------------------------------------
    # Quantitative query
    # --------------------------------------------------------

    if has_sql:
        return "quantitative", [
            SQL_AGENT,
        ]

    # --------------------------------------------------------
    # Default: document search
    # --------------------------------------------------------

    return "document_search", [
        SEARCH_AGENT,
    ]


# ============================================================
# Supervisor node
# ============================================================

async def supervisor_node(
    state: AgentState,
) -> dict[str, Any]:
    """
    Decide which specialist agent should execute next.
    """

    query = state.get(
        "user_query",
        "",
    ).strip()

    # --------------------------------------------------------
    # Validate query
    # --------------------------------------------------------

    if not query:
        return {
            "error": "User query cannot be empty.",
            "selected_agents": [],
            "next_agent": "",
        }

    # --------------------------------------------------------
    # First supervisor pass:
    # classify the query
    # --------------------------------------------------------

    if not state.get("selected_agents"):

        intent, agents = classify_intent(
            query
        )

        return {
            "intent": intent,
            "selected_agents": agents,
            "current_agent_index": 0,
            "next_agent": agents[0] if agents else "",
        }

    # --------------------------------------------------------
    # Existing plan:
    # move to the next agent
    # --------------------------------------------------------

    current_index = state.get(
        "current_agent_index",
        0,
    )

    agents = state.get(
        "selected_agents",
        [],
    )

    next_index = current_index + 1

    if next_index < len(agents):

        return {
            "current_agent_index": next_index,
            "next_agent": agents[next_index],
        }

    # --------------------------------------------------------
    # All selected agents have finished
    # --------------------------------------------------------

    return {
        "current_agent_index": next_index,
        "next_agent": "",
    }


# ============================================================
# Synthesis node
# ============================================================

async def synthesis_node(
    state: AgentState,
) -> dict[str, Any]:
    """
    Combine specialist agent outputs.

    This is currently a development implementation.

    Later, this node will use an LLM to synthesize a grounded
    response and attach citations.
    """

    sections: list[str] = []

    # --------------------------------------------------------
    # Search results
    # --------------------------------------------------------

    search_results = state.get(
        "search_results",
        [],
    )

    if search_results:

        sections.append(
            f"Document retrieval returned "
            f"{len(search_results)} result(s)."
        )

    # --------------------------------------------------------
    # SQL results
    # --------------------------------------------------------

    sql_results = state.get(
        "sql_results",
        {},
    )

    if sql_results:

        if sql_results.get("result") is not None:

            sections.append(
                "SQL Agent produced a quantitative result."
            )

        elif sql_results.get("message"):

            sections.append(
                sql_results["message"]
            )

    # --------------------------------------------------------
    # Vision results
    # --------------------------------------------------------

    vision_results = state.get(
        "vision_results",
        [],
    )

    if vision_results:

        sections.append(
            f"Vision Agent analyzed "
            f"{len(vision_results)} visual item(s)."
        )

    # Extract citations and text evidence from search results
    citations: list[dict[str, Any]] = []
    context_texts: list[str] = []
    for r in search_results:
        if isinstance(r, dict):
            text = r.get("text") or r.get("chunk_text") or r.get("content", "")
            if text:
                context_texts.append(text)
                meta = r.get("metadata", {})
                source_name = r.get("cloudinary_url") or r.get("parent_asset_id") or meta.get("filename") or "Uploaded Document"
                citations.append({
                    "source": str(source_name),
                    "page": meta.get("page_number", 1),
                    "snippet": text[:180] + ("..." if len(text) > 180 else ""),
                    "score": round(float(r.get("score", 0.85)), 3)
                })

    # --------------------------------------------------------
    # No results
    # --------------------------------------------------------

    if not sections and not context_texts:
        sections.append("No external document or database evidence was found for your query.")

    answer = " ".join(sections)

    # If context texts were retrieved, synthesize a grounded response
    final_memo = None
    query = state.get("user_query", "")
    if context_texts:
        try:
            import os
            import ollama
            chat_model = os.getenv("CHAT_MODEL", "llama3")
            prompt = (
                f"Document Context:\n"
                + "\n\n---\n\n".join(context_texts[:4])
                + f"\n\nQuestion: {query}\n\n"
                "Synthesize a clear, concise cited investment memo answering the question directly based on the context:"
            )
            resp = ollama.chat(
                model=chat_model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.2}
            )
            final_memo = resp["message"]["content"].strip()
        except Exception:
            pass

    if not final_memo:
        if context_texts:
            final_memo = (
                f"Synthesized Analysis for '{query}':\n\n"
                + "\n\n".join([f"• {c[:280]}..." for c in context_texts[:3]])
                + ("\n\n" + answer if answer else "")
            )
        else:
            final_memo = answer

    return {
        "intermediate_answer": final_memo,
        "final_answer": final_memo,
        "citations": citations,
    }