import pytest

from app.agents.search_agent import SearchAgent
from app.agents.sql_agent import SQLAgent
from app.agents.vision_agent import VisionAgent
from app.agents.supervisor import supervisor_node


@pytest.mark.asyncio
async def test_search_agent_empty_query():
    agent = SearchAgent()

    result = await agent.run("")

    assert result["success"] is False
    assert result["error"] == "Query cannot be empty."


@pytest.mark.asyncio
async def test_search_agent_without_vector_store():
    agent = SearchAgent()

    result = await agent.run("What is the revenue?")

    assert result["success"] is True
    assert result["agent"] == "search_agent"


@pytest.mark.asyncio
async def test_search_agent_scopes_retrieval_to_document(monkeypatch):
    from Ingestion import embedder

    retrieval_args = {}

    def fake_search(**kwargs):
        retrieval_args.update(kwargs)
        return []

    monkeypatch.setattr(embedder, "search_user_knowledge_base", fake_search)
    result = await SearchAgent().run(
        "What is the revenue?",
        user_id="analyst",
        document_id="doc-123",
    )

    assert result["success"] is True
    assert retrieval_args["user_id"] == "analyst"
    assert retrieval_args["document_id"] == "doc-123"


@pytest.mark.asyncio
async def test_supervisor_uses_document_search_for_attached_document():
    result = await supervisor_node({
        "user_query": "Compare revenue in 2024 and 2025",
        "document_id": "doc-123",
        "selected_agents": [],
    })

    assert result["intent"] == "document_search"
    assert result["selected_agents"] == ["search_agent"]


def test_vector_search_applies_document_filter(monkeypatch):
    from types import SimpleNamespace
    from Ingestion import embedder

    captured = {}

    class FakeQdrantClient:
        def query_points(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(points=[])

    monkeypatch.setattr(embedder, "init_qdrant_collection", lambda: None)
    monkeypatch.setattr(embedder, "get_embedding", lambda query: [0.0] * embedder.VECTOR_DIMENSION)
    monkeypatch.setattr(embedder, "qdrant_client", FakeQdrantClient())

    embedder.search_user_knowledge_base(
        user_id="analyst",
        query="revenue",
        document_id="doc-123",
    )

    conditions = {condition.key: condition.match.value for condition in captured["query_filter"].must}
    assert conditions == {"user_id": "analyst", "document_id": "doc-123"}


@pytest.mark.asyncio
async def test_sql_agent_empty_query():
    agent = SQLAgent()

    result = await agent.run("")

    assert result["success"] is False
    assert result["error"] == "Query cannot be empty."


@pytest.mark.asyncio
async def test_sql_agent_without_database():
    agent = SQLAgent()

    result = await agent.run("What was revenue in 2025?")

    assert result["success"] is True
    assert result["agent"] == "sql_agent"


@pytest.mark.asyncio
async def test_vision_agent_empty_query():
    agent = VisionAgent()

    result = await agent.run("")

    assert result["success"] is False
    assert result["error"] == "Query cannot be empty."


@pytest.mark.asyncio
async def test_vision_agent_without_model():
    agent = VisionAgent()

    result = await agent.run(
        "What does this chart show?",
        [],
    )

    assert result["success"] is True
    assert result["agent"] == "vision_agent"