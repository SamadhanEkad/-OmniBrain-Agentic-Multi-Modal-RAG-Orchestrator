import time
import streamlit as st
import pandas as pd
from Utils.api import upload_file, get

st.set_page_config(page_title="Upload Documents | OmniBrain", page_icon="📄", layout="wide")
st.header("📄 Document Ingestion Pipeline")
st.caption("Upload PDFs or image files for multi-modal parsing, chunking, and vector embedding.")

# -----------------------------------------------------------------------------
# File Uploader & Processing
# -----------------------------------------------------------------------------
uploaded_files = st.file_uploader(
    "Select files to upload",
    type=["pdf", "png", "jpg", "jpeg", "txt"],
    accept_multiple_files=True
)

if uploaded_files:
    st.write(f"**Selected files:** {len(uploaded_files)}")
    
    if st.button("Trigger Ingestion", type="primary"):
        total_files = len(uploaded_files)
        success_count = 0
        error_messages = []
        overall_progress = st.progress(0, text="Starting document ingestion...")

        for idx, file in enumerate(uploaded_files, start=1):
            file_progress = st.status(f"Processing '{file.name}' ({idx}/{total_files})...", expanded=True)
            file_payload = (file.name, file.getvalue(), file.type or "application/octet-stream")
            
            try:
                response = upload_file("/api/v1/upload", file_tuple=file_payload)
                if response.status_code in (200, 201, 202):
                    res_data = response.json()
                    job_id = res_data.get("job_id") or (res_data.get("files", [{}])[0].get("job_id"))
                    
                    if job_id:
                        file_progress.write(f"Queued with job ID `{job_id}`. Polling ingestion pipeline status...")
                        # Poll status up to 30 seconds
                        for _ in range(15):
                            time.sleep(1.5)
                            status_res = get(f"/api/v1/status/{job_id}")
                            if status_res.status_code == 200:
                                sdata = status_res.json()
                                st_val = sdata.get("status", "processing")
                                pct = sdata.get("progress", 50)
                                file_progress.write(f"Stage: **{st_val}** ({pct}%)")
                                if st_val == "completed":
                                    file_progress.update(label=f"✓ Indexed '{file.name}'", state="complete")
                                    success_count += 1
                                    break
                                elif st_val == "failed":
                                    err_str = sdata.get("error", "Unknown error")
                                    file_progress.update(label=f"✗ Failed '{file.name}': {err_str}", state="error")
                                    error_messages.append(f"{file.name}: {err_str}")
                                    break
                        else:
                            # Finished polling loop, assume queued/processing
                            file_progress.update(label=f"✓ Ingestion queued for '{file.name}'", state="complete")
                            success_count += 1
                    else:
                        file_progress.update(label=f"✓ Uploaded '{file.name}'", state="complete")
                        success_count += 1
                else:
                    file_progress.update(label=f"✗ Error uploading '{file.name}'", state="error")
                    error_messages.append(f"{file.name}: Status {response.status_code} - {response.text}")
            except Exception as err:
                file_progress.update(label=f"✗ Error: {err}", state="error")
                error_messages.append(f"{file.name}: {err}")

            overall_progress.progress(int((idx / total_files) * 100))

        if success_count > 0:
            st.success(f"Successfully processed {success_count}/{total_files} document(s).")

        if error_messages:
            with st.expander("Ingestion Issues", expanded=True):
                for err in error_messages:
                    st.error(err)

st.divider()

# -----------------------------------------------------------------------------
# Knowledge Base Documents Catalog
# -----------------------------------------------------------------------------
st.subheader("📚 Indexed Documents in Knowledge Base")
col1, col2 = st.columns([6, 1])
with col2:
    if st.button("🔄 Refresh"):
        st.rerun()

docs_res = get("/api/v1/documents")
if docs_res.status_code == 200:
    docs = docs_res.json()
    if docs and isinstance(docs, list):
        display_data = []
        for d in docs:
            display_data.append({
                "Document Title": d.get("title") or "Untitled Document",
                "Status": d.get("status", "indexed").upper(),
                "Chunks": d.get("chunk_count", 0),
                "File Type": d.get("file_type", "pdf"),
                "Document ID": d.get("id"),
            })
        st.dataframe(pd.DataFrame(display_data), use_container_width=True)
    else:
        st.info("No documents indexed yet. Upload a document above to get started.")
else:
    st.warning("Could not reach backend `/api/v1/documents` endpoint.")