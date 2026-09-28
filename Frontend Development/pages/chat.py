import json
import uuid
import streamlit as st
from Utils.api import stream_chat, post, get

st.set_page_config(page_title="Chat | OmniBrain", page_icon="💬", layout="wide")
st.header("💬 Multi-Agent Chat Interface")
st.caption("Agentic conversational RAG with specialist agents and grounded citations.")

# Initialize chat session ID and state
if "session_id" not in st.session_state:
    st.session_state["session_id"] = str(uuid.uuid4())

if "messages" not in st.session_state:
    st.session_state["messages"] = []

if "attached_doc_id" not in st.session_state:
    st.session_state["attached_doc_id"] = None

# -----------------------------------------------------------------------------
# Sidebar: Session Controls & Document Attachment
# -----------------------------------------------------------------------------
st.sidebar.title("Chat Controls")
if st.sidebar.button("➕ New Chat Session"):
    st.session_state["session_id"] = str(uuid.uuid4())
    st.session_state["messages"] = []
    st.session_state["attached_doc_id"] = None
    st.rerun()

st.sidebar.caption(f"Session: `{st.session_state['session_id'][:8]}...`")
st.sidebar.divider()

# Document Attachment Scope
st.sidebar.subheader("📄 Scope Retrieval")
docs_res = get("/api/v1/documents")
doc_options = {"all": "All Documents (Global Knowledge Base)"}

if docs_res.status_code == 200:
    docs_data = docs_res.json()
    if isinstance(docs_data, list):
        for d in docs_data:
            doc_options[d["id"]] = d.get("title") or f"Doc {d['id'][:8]}"

selected_scope = st.sidebar.selectbox(
    "Active Document Context:",
    options=list(doc_options.keys()),
    format_func=lambda x: doc_options.get(x, x),
    index=0
)

active_doc_id = None if selected_scope == "all" else selected_scope
st.session_state["attached_doc_id"] = active_doc_id

# Suggested Questions for attached document
suggestions = []
if active_doc_id:
    sug_res = get(f"/api/v1/documents/{active_doc_id}/suggestions")
    if sug_res.status_code == 200:
        suggestions = sug_res.json().get("questions", [])

if suggestions:
    st.sidebar.subheader("💡 Suggested Questions")
    for q in suggestions[:4]:
        if st.sidebar.button(f"👉 {q}", key=f"sug_{q[:20]}"):
            st.session_state["prompt_from_suggestion"] = q
            st.rerun()

# -----------------------------------------------------------------------------
# Render Chat History
# -----------------------------------------------------------------------------
agent_icons = {
    "search_agent": "🔍 Search Agent",
    "sql_agent": "📊 SQL Agent",
    "vision_agent": "👁️ Vision Agent",
    "supervisor": "🧠 OmniBrain Supervisor",
}

for msg in st.session_state["messages"]:
    with st.chat_message(msg["role"]):
        if msg.get("agent"):
            agent_label = agent_icons.get(msg["agent"], msg["agent"])
            st.caption(f"**Agent Dispatched:** `{agent_label}`")

        if msg.get("thought"):
            with st.expander("Agent Reasoning / Thoughts", expanded=False):
                st.markdown(msg["thought"])

        st.markdown(msg["content"])

        if msg.get("citations"):
            with st.expander(f"📚 Grounded Citations ({len(msg['citations'])})", expanded=False):
                for idx, c in enumerate(msg["citations"], 1):
                    src_title = c.get("document_title") or c.get("source") or "Uploaded Document"
                    page_num = c.get("page") or c.get("page_number", 1)
                    score_val = c.get("score")
                    score_str = f" · Similarity: {score_val}" if score_val is not None else ""
                    st.markdown(f"**[{idx}] {src_title}** (Page {page_num}{score_str})")
                    if c.get("snippet"):
                        st.caption(c["snippet"])
                    st.divider()

        if msg.get("chart"):
            st.image(msg["chart"], caption="Agent Generated Multimodal Visual")

# -----------------------------------------------------------------------------
# Prompt Input & Dispatch
# -----------------------------------------------------------------------------
suggested_prompt = st.session_state.pop("prompt_from_suggestion", None)
prompt = st.chat_input("Ask a question about financial statements, revenues, margins...") or suggested_prompt

if prompt:
    st.session_state["messages"].append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        thought_container = st.empty()
        response_container = st.empty()

        full_response = ""
        full_thought = ""
        citations_data = []
        agent_used = "supervisor"
        chart_data = None

        payload = {
            "query": prompt,
            "session_id": st.session_state["session_id"],
            "doc_id": active_doc_id
        }

        try:
            stream = stream_chat("/api/v1/chat", payload=payload)
            stream_received = False

            for token_chunk in stream:
                stream_received = True
                try:
                    event_payload = json.loads(token_chunk)
                    if isinstance(event_payload, dict):
                        if "thought" in event_payload:
                            full_thought += event_payload["thought"]
                            thought_container.expander("Agent Reasoning Steps", expanded=True).markdown(full_thought)
                        if "token" in event_payload:
                            full_response += event_payload["token"]
                            response_container.markdown(full_response + "▌")
                        elif "response" in event_payload:
                            full_response += event_payload["response"]
                            response_container.markdown(full_response + "▌")
                        elif "memo" in event_payload:
                            full_response += event_payload["memo"]
                            response_container.markdown(full_response + "▌")
                        if "citations" in event_payload:
                            citations_data = event_payload["citations"]
                        if "agent" in event_payload:
                            agent_used = event_payload["agent"]
                        if "chart_url" in event_payload:
                            chart_data = event_payload["chart_url"]
                    else:
                        full_response += str(event_payload)
                        response_container.markdown(full_response + "▌")
                except json.JSONDecodeError:
                    full_response += token_chunk
                    response_container.markdown(full_response + "▌")

            # Fallback if streaming didn't return content
            if not stream_received or not full_response:
                res = post("/api/v1/chat", json_data=payload)
                if res.status_code == 200:
                    data = res.json()
                    full_response = data.get("response") or data.get("memo") or res.text
                    citations_data = data.get("citations", [])
                    agent_used = data.get("agent", "supervisor")
                    chart_data = data.get("chart_url")

            response_container.markdown(full_response)

            if citations_data:
                with st.expander(f"📚 Grounded Citations ({len(citations_data)})", expanded=True):
                    for idx, c in enumerate(citations_data, 1):
                        src_title = c.get("document_title") or c.get("source") or "Uploaded Document"
                        page_num = c.get("page") or c.get("page_number", 1)
                        score_val = c.get("score")
                        score_str = f" · Similarity: {score_val}" if score_val is not None else ""
                        st.markdown(f"**[{idx}] {src_title}** (Page {page_num}{score_str})")
                        if c.get("snippet"):
                            st.caption(c["snippet"])
                        st.divider()

            if chart_data:
                st.image(chart_data, caption="Agent Generated Multimodal Visual")

            st.session_state["messages"].append({
                "role": "assistant",
                "content": full_response,
                "thought": full_thought,
                "citations": citations_data,
                "agent": agent_used,
                "chart": chart_data,
            })

        except Exception as err:
            st.error(f"Chat communication error: {err}")