import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    Header,
)
from Database.schemas import (
    ChatRequest,
    ChatResponse,
    Citation,
    CitationSource,
    HistoryResponse,
    MessageRecord,
    TokenData,
)
from auth import get_current_user

logger = logging.getLogger("omnibrain.chat")
router = APIRouter()

SESSION_STORAGE: Dict[str, List[Dict[str, Any]]] = {}
CHAT_MODEL = os.getenv("CHAT_MODEL", "llama3")


# -----------------------------------------------------------------------------
# AUTH & GUARDRAIL HELPERS
# -----------------------------------------------------------------------------

async def _resolve_user_optional(authorization: Optional[str] = Header(None)) -> TokenData:
    """Extracts credentials if valid Bearer token exists; falls back to guest."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        try:
            return await get_current_user(token=token)
        except HTTPException:
            pass
    return TokenData(username="guest_user", role="user")


async def apply_guardrails_input(query: str, trace_id: str) -> str:
    try:
        from Guardrails.nemo_config import validate_input_rails
        return await validate_input_rails(query, trace_id=trace_id)
    except ImportError:
        blocked_terms = ["ignore all instructions", "system prompt leak", "exploit"]
        if any(term in query.lower() for term in blocked_terms):
            from main import GuardrailViolationException
            raise GuardrailViolationException(
                message="Your query contains restricted prompt patterns violating NeMo safety rails.",
                violation_type="jailbreak_attempt"
            )
        return query


async def apply_guardrails_output(memo: str, trace_id: str) -> str:
    try:
        from Guardrails.nemo_config import validate_output_rails
        return await validate_output_rails(memo, trace_id=trace_id)
    except ImportError:
        return memo


async def log_telemetry_trace(trace_id: str, session_id: str, query: str, output: str, citations: List[Citation]):
    try:
        from Guardrails.langfuse_client import log_trace_event
        await log_trace_event(
            trace_id=trace_id,
            session_id=session_id,
            input_query=query,
            output_memo=output,
            citations=[c.model_dump() for c in citations]
        )
    except ImportError:
        pass


# -----------------------------------------------------------------------------
# DYNAMIC RAG / AGENT FALLBACKS
# -----------------------------------------------------------------------------

def _retrieve_context(
    query: str,
    user_id: str = "guest_user",
    limit: int = 4,
    document_id: Optional[str] = None,
) -> tuple[List[str], List[Dict[str, Any]]]:
    """Queries Qdrant for matching document chunks."""
    retrieved_texts: List[str] = []
    citations_data: List[Dict[str, Any]] = []

    try:
        from Ingestion.embedder import search_user_knowledge_base
        raw_results = search_user_knowledge_base(
            user_id=user_id, query=query, limit=limit, document_id=document_id
        )
        
        # If user-scoped retrieval returns empty, try guest/global pool
        if not raw_results and user_id != "guest_user":
            raw_results = search_user_knowledge_base(
                user_id="guest_user", query=query, limit=limit, document_id=document_id
            )

        for res in raw_results:
            text = res.get("text", "")
            if text:
                retrieved_texts.append(text)
                citations_data.append({
                    "source": res.get("metadata", {}).get("filename") or res.get("cloudinary_url") or "Uploaded Document",
                    "document_id": res.get("metadata", {}).get("document_id"),
                    "document_title": res.get("metadata", {}).get("filename"),
                    "page": res.get("metadata", {}).get("page_number", 1),
                    "chunk_index": res.get("metadata", {}).get("chunk_index"),
                    "snippet": text,
                    "score": round(float(res.get("score", 0.0)), 3),
                    "metadata": res.get("metadata", {}),
                })
    except Exception as exc:
        logger.warning(f"Vector retrieval fallback triggered: {exc}")

    return retrieved_texts, citations_data


def _generate_llm_response(query: str, context_chunks: List[str]) -> str:
    """Queries Ollama with retrieved context chunks."""
    import ollama

    formatted_context = "\n\n---\n\n".join(context_chunks) if context_chunks else "No relevant document excerpts found."
    system_prompt = (
        "You are OmniBrain, an advanced document reasoning agent. Answer the user's question "
        "directly using only the provided document excerpts. Do not use outside knowledge or infer unsupported facts. "
        "If the excerpts do not contain the answer, say so clearly, and cite page numbers when available."
    )
    user_prompt = f"Document Context:\n{formatted_context}\n\nUser Question:\n{query}"

    try:
        resp = ollama.chat(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return resp["message"]["content"]
    except Exception as exc:
        logger.warning(f"Ollama chat call failed: {exc}")
        if context_chunks:
            return (
                f"Retrieved {len(context_chunks)} excerpt(s) from your document, but the LLM generation failed:\n\n"
                + "\n\n".join([f"• {c[:250]}..." for c in context_chunks])
            )
        return (
            "I could not connect to the local Ollama LLM instance or find indexed documents. "
            "Please verify `ollama serve` is running."
        )


async def invoke_agent_supervisor(
    query: str,
    session_id: str,
    trace_id: str,
    filters: Optional[Dict[str, Any]] = None,
    user_id: str = "guest_user",
    document_id: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        from app.agents.graph import OmniBrainGraph
        graph = OmniBrainGraph()
        state = await graph.ainvoke(
            user_query=query, document_id=document_id, user_id=user_id
        )
        memo = state.get("final_answer") or state.get("intermediate_answer")
        citations = state.get("citations", [])
        if memo and "No external document or database evidence" not in memo:
            agent = (
                "vision_agent" if state.get("vision_results")
                else "sql_agent" if state.get("sql_results")
                else "search_agent" if state.get("search_results")
                else "supervisor"
            )
            return {
                "memo": memo,
                "citations": citations,
                "agent": agent,
            }
    except Exception as exc:
        logger.warning(f"OmniBrainGraph agent run fallback: {exc}")

    # Fallback to direct context retrieval + local synthesis
    context_chunks, citations = _retrieve_context(
        query=query, user_id=user_id, document_id=document_id
    )
    if document_id and not context_chunks:
        return {
            "memo": "I couldn't find indexed evidence for this question in the attached document. Please check that indexing completed or try a more specific question.",
            "citations": [],
            "agent": "search_agent",
        }
    memo = _generate_llm_response(query=query, context_chunks=context_chunks)
    return {
        "memo": memo,
        "citations": citations,
        "agent": "search_agent" if citations else "supervisor",
    }


async def stream_agent_supervisor(query: str, session_id: str, trace_id: str, filters: Optional[Dict[str, Any]] = None, user_id: str = "guest_user"):
    yield {"type": "status", "content": "Initializing OmniBrain Multi-Agent graph..."}
    memo = ""
    citations = []

    try:
        from app.agents.supervisor import classify_intent
        intent, agents = classify_intent(query)
        yield {"type": "thought", "content": f"Classified intent: **{intent}**. Active agents: `{', '.join(agents)}`."}

        from app.agents.graph import OmniBrainGraph
        graph = OmniBrainGraph()
        state = await graph.ainvoke(
            user_query=query,
            document_id=(filters or {}).get("doc_id"),
            user_id=user_id,
        )
        memo = state.get("final_answer") or state.get("intermediate_answer") or ""
        citations = state.get("citations", [])
    except Exception as exc:
        logger.warning(f"OmniBrainGraph stream fallback: {exc}")

    if not memo or "No external document or database evidence" in memo:
        context_chunks, fallback_citations = _retrieve_context(
            query=query,
            user_id=user_id,
            document_id=(filters or {}).get("doc_id"),
        )
        memo = _generate_llm_response(query=query, context_chunks=context_chunks)
        citations = fallback_citations if not citations else citations

    # Stream words as incremental token chunks for responsive UI
    words = memo.split(" ")
    for i, word in enumerate(words):
        token_space = word if i == len(words) - 1 else word + " "
        yield {"type": "token", "content": token_space}
        await asyncio.sleep(0.01)

    if citations:
        yield {"type": "citations", "citations": citations}


# -----------------------------------------------------------------------------
# SESSION PERSISTENCE
# -----------------------------------------------------------------------------

async def persist_chat_turn(session_id: str, user: str, query: str, memo: str, citations: List[Citation]):
    try:
        from Database.crud import save_chat_turn
        await save_chat_turn(
            session_id=session_id,
            username=user,
            query=query,
            response=memo,
            citations=[c.model_dump() for c in citations]
        )
    except Exception as exc:
        logger.warning(f"Database persistence warning: {exc}")
        if session_id not in SESSION_STORAGE:
            SESSION_STORAGE[session_id] = []

        now = datetime.now(timezone.utc)
        SESSION_STORAGE[session_id].append({
            "role": "user",
            "content": query,
            "citations": None,
            "timestamp": now
        })
        SESSION_STORAGE[session_id].append({
            "role": "assistant",
            "content": memo,
            "citations": citations,
            "timestamp": now
        })


# -----------------------------------------------------------------------------
# HTTP & WEBSOCKET ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat_endpoint(
    request_http: Request,
    request: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    current_user = await _resolve_user_optional(authorization)
    trace_id = getattr(request_http.state, "trace_id", str(uuid.uuid4()))

    validated_query = await apply_guardrails_input(request.query, trace_id=trace_id)

    agent_output = await invoke_agent_supervisor(
        query=validated_query,
        session_id=request.session_id,
        trace_id=trace_id,
        filters=request.filters,
        user_id=current_user.username or "guest_user",
        document_id=request.doc_id,
    )

    raw_memo = agent_output.get("memo", "No response generated.")
    sanitized_memo = await apply_guardrails_output(raw_memo, trace_id=trace_id)

    formatted_citations = [
        Citation(
            source=c.get("source", "Unknown Source"),
            document_id=c.get("document_id"),
            document_title=c.get("document_title"),
            page=c.get("page") or c.get("page_number", 1),
            chunk_index=c.get("chunk_index"),
            snippet=c.get("snippet", ""),
            score=c.get("score"),
            metadata=c.get("metadata", {}),
        )
        for c in agent_output.get("citations", [])
    ]

    await persist_chat_turn(
        session_id=request.session_id,
        user=current_user.username or "anonymous",
        query=request.query,
        memo=sanitized_memo,
        citations=formatted_citations
    )

    await log_telemetry_trace(
        trace_id=trace_id,
        session_id=request.session_id,
        query=request.query,
        output=sanitized_memo,
        citations=formatted_citations
    )

    return ChatResponse(
        session_id=request.session_id,
        memo=sanitized_memo,
        response=sanitized_memo,
        citations=formatted_citations,
        agent=agent_output.get("agent", "supervisor"),
        generated_at=datetime.now(timezone.utc)
    )


@router.get("/history", response_model=HistoryResponse, status_code=status.HTTP_200_OK, include_in_schema=False)
@router.get("/chat/history", response_model=HistoryResponse, status_code=status.HTTP_200_OK)
async def get_chat_history(
    session_id: str = Query(..., min_length=1, description="Unique identifier for the chat session"),
    authorization: Optional[str] = Header(None)
):
    await _resolve_user_optional(authorization)
    try:
        from Database.crud import get_session_history
        db_records = await get_session_history(session_id=session_id)
        if db_records:
            formatted_messages = [
                MessageRecord(
                    role=rec.get("role"),
                    content=rec.get("content"),
                    citations=[Citation(**c) for c in rec.get("citations", [])] if rec.get("citations") else None,
                    timestamp=rec.get("timestamp", datetime.now(timezone.utc))
                )
                for rec in db_records
            ]
            return HistoryResponse(session_id=session_id, messages=formatted_messages)
    except Exception as exc:
        logger.warning(f"Database history fetch warning: {exc}")

    records = SESSION_STORAGE.get(session_id, [])
    formatted_messages = [
        MessageRecord(
            role=rec["role"],
            content=rec["content"],
            citations=rec.get("citations"),
            timestamp=rec.get("timestamp", datetime.now(timezone.utc))
        )
        for rec in records
    ]
    return HistoryResponse(session_id=session_id, messages=formatted_messages)


@router.websocket("/chat/stream")
async def websocket_chat_stream(websocket: WebSocket):
    await websocket.accept()
    trace_id = str(uuid.uuid4())
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON format."})
                continue

            query = payload.get("query", "").strip()
            session_id = payload.get("session_id", "default_ws_session")
            filters = payload.get("filters", {})

            if not query:
                await websocket.send_json({"type": "error", "content": "Query cannot be empty."})
                continue

            try:
                validated_query = await apply_guardrails_input(query, trace_id=trace_id)
            except Exception as e:
                await websocket.send_json({"type": "guardrail_block", "content": str(e)})
                continue

            accumulated_memo = ""
            collected_citations = []

            async for event in stream_agent_supervisor(
                query=validated_query,
                session_id=session_id,
                trace_id=trace_id,
                filters=filters
            ):
                await websocket.send_json(event)
                if event.get("type") == "token":
                    accumulated_memo += event.get("content", "")
                elif event.get("type") == "citations":
                    collected_citations = [
                        Citation(**c) for c in event.get("citations", [])
                    ]

            await persist_chat_turn(
                session_id=session_id,
                user="stream_user",
                query=query,
                memo=accumulated_memo,
                citations=collected_citations
            )

            await log_telemetry_trace(
                trace_id=trace_id,
                session_id=session_id,
                query=query,
                output=accumulated_memo,
                citations=collected_citations
            )

            await websocket.send_json({"type": "done", "session_id": session_id, "trace_id": trace_id})

    except WebSocketDisconnect:
        pass