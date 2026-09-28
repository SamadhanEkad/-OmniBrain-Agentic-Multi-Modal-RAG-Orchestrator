"""OmniBrain Multi-Agent Orchestrator Module."""

from .graph import OmniBrainGraph, create_graph
from .state import AgentState
from .search_agent import SearchAgent
from .sql_agent import SQLAgent
from .vision_agent import VisionAgent
from .supervisor import (
    classify_intent,
    supervisor_node,
    synthesis_node,
    SEARCH_AGENT,
    SQL_AGENT,
    VISION_AGENT,
)
from .self_rag_nodes import (
    evaluate_retrieval,
    rewrite_query,
    should_retry,
)

# Shared singleton graph instance
_default_graph = None


def get_default_graph() -> OmniBrainGraph:
    global _default_graph
    if _default_graph is None:
        _default_graph = OmniBrainGraph()
    return _default_graph


async def run_supervisor_workflow(
    query: str,
    session_id: str = "default_session",
    trace_id: str = "",
    filters: dict = None,
    images: list = None,
) -> dict:
    """Executes the full LangGraph multi-agent workflow."""
    graph = get_default_graph()
    state = await graph.ainvoke(user_query=query, images=images or [])
    
    memo = state.get("final_answer") or state.get("intermediate_answer") or "Analysis completed."
    citations = state.get("citations", [])
    
    return {
        "memo": memo,
        "citations": citations,
        "selected_agents": state.get("selected_agents", []),
        "relevance_score": state.get("relevance_score", 1.0),
        "grounded": state.get("grounded", True),
    }


async def stream_supervisor_workflow(
    query: str,
    session_id: str = "default_session",
    trace_id: str = "",
    filters: dict = None,
):
    """Streams execution steps and token output for the supervisor workflow."""
    graph = get_default_graph()
    intent, agents = classify_intent(query)
    
    yield {"type": "status", "content": f"Classified intent: {intent}. Routing to: {', '.join(agents)}."}
    
    state = await graph.ainvoke(user_query=query)
    memo = state.get("final_answer") or state.get("intermediate_answer") or "Analysis completed."
    citations = state.get("citations", [])
    
    words = memo.split(" ")
    for idx, word in enumerate(words):
        token_chunk = word if idx == len(words) - 1 else word + " "
        yield {"type": "token", "content": token_chunk}
        
    if citations:
        yield {"type": "citations", "citations": citations}


__all__ = [
    "OmniBrainGraph",
    "create_graph",
    "get_default_graph",
    "run_supervisor_workflow",
    "stream_supervisor_workflow",
    "AgentState",
    "SearchAgent",
    "SQLAgent",
    "VisionAgent",
    "classify_intent",
    "supervisor_node",
    "synthesis_node",
    "evaluate_retrieval",
    "rewrite_query",
    "should_retry",
    "SEARCH_AGENT",
    "SQL_AGENT",
    "VISION_AGENT",
]
