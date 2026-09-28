from typing import Any


class SearchAgent:
    """
    Semantic document retrieval agent.

    The actual Qdrant/vector-store implementation is injected
    through vector_store.
    """

    name = "search_agent"

    def __init__(self, vector_store: Any = None):
        self.vector_store = vector_store

    async def run(self, query: str) -> dict[str, Any]:
        """
        Retrieve relevant document chunks.
        """

        if not query or not query.strip():
            return {
                "success": False,
                "agent": self.name,
                "results": [],
                "error": "Query cannot be empty.",
            }

        # Default vector store fallback: query Qdrant user knowledge base
        if self.vector_store is None:
            try:
                from Ingestion.embedder import search_user_knowledge_base
                results = search_user_knowledge_base(user_id="guest_user", query=query, limit=5)
                return {
                    "success": True,
                    "agent": self.name,
                    "results": results or [],
                }
            except Exception as e:
                return {
                    "success": True,
                    "agent": self.name,
                    "results": [],
                    "message": f"Vector store offline or empty: {e}",
                }

        try:
            results = await self.vector_store.search(query)

            return {
                "success": True,
                "agent": self.name,
                "results": results or [],
            }

        except Exception as exc:
            return {
                "success": False,
                "agent": self.name,
                "results": [],
                "error": str(exc),
            }