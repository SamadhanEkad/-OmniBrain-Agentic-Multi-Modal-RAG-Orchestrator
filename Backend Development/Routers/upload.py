import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, File, Header, HTTPException, UploadFile, status

from Database.schemas import JobStatusResponse, TokenData, UploadResponse
from auth import get_current_user

router = APIRouter()
STAGING_DIR = Path("staging_uploads")
STAGING_DIR.mkdir(parents=True, exist_ok=True)
JOB_REGISTRY: Dict[str, Dict[str, Any]] = {}

ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpeg",
    "image/jpg": ".jpg",
    "text/plain": ".txt",
}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024


async def _resolve_user_optional(authorization: Optional[str] = Header(None)) -> TokenData:
    if authorization and authorization.startswith("Bearer "):
        try:
            return await get_current_user(token=authorization.split(" ", 1)[1])
        except HTTPException:
            pass
    return TokenData(username="guest_user", role="user")


async def execute_ingestion_pipeline(job_id: str, file_path: Path, filename: str, username: str):
    """Extract, chunk, and index one uploaded document under its stable UUID."""
    try:
        JOB_REGISTRY[job_id]["status"] = "processing"
        JOB_REGISTRY[job_id]["progress"] = 20

        from Ingestion.chunker import chunk_text
        from Ingestion.embedder import embed_and_store_chunks
        from Ingestion.extractor import summarize_image
        from Ingestion.pdf_extractor import extract_pdf_content, extract_text_from_pdf

        chunks = []
        chunk_metadata = []
        tables = []
        image_paths = []
        if file_path.suffix.lower() == ".pdf":
            try:
                page_texts, tables, image_paths = extract_pdf_content(str(file_path))
                for page_number, page_text in enumerate(page_texts, start=1):
                    if not page_text or not page_text.strip():
                        # Scanned or image-only page: ensure it still contributes a searchable chunk with page metadata
                        page_text = f"[Page {page_number}: Scanned visual content and figure in {filename}]"
                    page_chunks = chunk_text(page_text)
                    chunks.extend(page_chunks)
                    chunk_metadata.extend({"page_number": page_number} for _ in page_chunks)
            except Exception:
                raw_text = extract_text_from_pdf(str(file_path))
                chunks = chunk_text(raw_text)
                chunk_metadata = [{"page_number": 1} for _ in chunks]

            for table_index, table in enumerate(tables, start=1):
                table_text = f"Table {table_index} from {filename}:\n{table.to_string(index=False)}"
                table_chunks = chunk_text(table_text)
                chunks.extend(table_chunks)
                table_page = table.attrs.get("page_number")
                chunk_metadata.extend({"source_type": "table", "page_number": table_page} for _ in table_chunks)

            for image_path in image_paths:
                page_match = re.search(r"page_(\d+)_", Path(image_path).name)
                page_num = int(page_match.group(1)) if page_match else None
                image_summary = summarize_image(image_path)
                if not image_summary or image_summary == "Extracted document image.":
                    image_summary = f"Visual diagram or scanned figure on page {page_num or 1} of {filename}."
                image_chunks = chunk_text(f"Visual content: {image_summary}")
                chunks.extend(image_chunks)
                chunk_metadata.extend({
                    "source_type": "image",
                    "page_number": page_num,
                } for _ in image_chunks)
        else:
            raw_text = file_path.read_text(encoding="utf-8", errors="ignore")
            chunks = chunk_text(raw_text)
            chunk_metadata = [{} for _ in chunks]

        JOB_REGISTRY[job_id]["progress"] = 50
        if not chunks:
            raise ValueError("No readable text or tables were extracted from this file.")

        embed_and_store_chunks(
            chunks=chunks,
            user_id=username,
            parent_asset_id=job_id,
            asset_type="document",
            extra_metadata={
                "document_id": job_id,
                "filename": filename,
                "tables_count": len(tables),
                "images_count": len(image_paths),
            },
            chunk_metadata=chunk_metadata,
        )
        JOB_REGISTRY[job_id]["progress"] = 80

        try:
            from sqlalchemy import select
            from Database import async_session_factory, Document, User

            async with async_session_factory() as session:
                async with session.begin():
                    db_user = (await session.execute(
                        select(User).where(User.username == username)
                    )).scalars().first()
                    if not db_user:
                        db_user = User(
                            username=username,
                            email=f"{username}@omnibrain.local",
                            hashed_password="mock_pw",
                            role="user",
                        )
                        session.add(db_user)
                        await session.flush()

                    session.add(Document(
                        id=uuid.UUID(job_id),
                        user_id=db_user.id,
                        title=filename,
                        file_type="application/pdf" if file_path.suffix.lower() == ".pdf" else "text/plain",
                        file_size_bytes=file_path.stat().st_size if file_path.exists() else 0,
                        chunk_count=len(chunks),
                        status="indexed",
                        tags=["uploaded", file_path.suffix.lower().lstrip(".")],
                        meta_info={"job_id": job_id, "tables": len(tables), "images": len(image_paths)},
                    ))
        except Exception as db_error:
            # Vector indexing remains usable when the optional SQL catalog is offline.
            JOB_REGISTRY[job_id]["catalog_warning"] = str(db_error)

        JOB_REGISTRY[job_id]["progress"] = 100
        JOB_REGISTRY[job_id]["status"] = "completed"
        JOB_REGISTRY[job_id]["completed_at"] = datetime.now(timezone.utc)
    except Exception as exc:
        JOB_REGISTRY[job_id]["status"] = "failed"
        JOB_REGISTRY[job_id]["error"] = str(exc)
        JOB_REGISTRY[job_id]["completed_at"] = datetime.now(timezone.utc)


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_200_OK)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    current_user = await _resolve_user_optional(authorization)
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if file.content_type not in ALLOWED_MIME_TYPES and file_ext not in ALLOWED_MIME_TYPES.values():
        raise HTTPException(status_code=415, detail=f"Unsupported format '{file.content_type}'.")

    job_id = str(uuid.uuid4())
    filename = Path(file.filename).name if file.filename else f"doc_{job_id}.pdf"
    file_path = STAGING_DIR / f"{job_id}_{filename}"
    file_size = 0
    try:
        with file_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds maximum size (50 MB).")
                buffer.write(chunk)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    JOB_REGISTRY[job_id] = {
        "job_id": job_id,
        "doc_id": job_id,
        "filename": filename,
        "status": "queued",
        "progress": 0,
        "uploaded_by": current_user.username,
        "file_path": str(file_path),
        "error": None,
        "created_at": datetime.now(timezone.utc),
    }
    background_tasks.add_task(
        execute_ingestion_pipeline, job_id, file_path, filename, current_user.username
    )
    return UploadResponse(
        status="success",
        total_documents=1,
        files=[{"filename": filename, "job_id": job_id, "doc_id": job_id, "status": "queued", "size_bytes": file_size}],
        job_id=job_id,
        doc_id=job_id,
        message="Document queued for ingestion.",
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_ingestion_status(job_id: str):
    job = JOB_REGISTRY.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        filename=job.get("filename"),
        error=job.get("error"),
        created_at=job.get("created_at", datetime.now(timezone.utc)),
    )


@router.get("/documents")
async def list_user_documents(authorization: Optional[str] = Header(None)):
    current_user = await _resolve_user_optional(authorization)
    try:
        from Database import async_session_factory
        from Database.crud import get_documents_by_user, get_user_by_username
        async with async_session_factory() as session:
            user = await get_user_by_username(session, current_user.username)
            documents = await get_documents_by_user(session, user.id) if user else []
            records = [{
                "id": str(document.id),
                "title": document.title,
                "status": document.status,
                "file_type": document.file_type,
                "chunk_count": document.chunk_count,
                "created_at": document.created_at,
            } for document in documents]
            known_ids = {record["id"] for record in records}
            records.extend({
                "id": job["doc_id"],
                "title": job["filename"],
                "status": job["status"],
                "chunk_count": 0,
                "created_at": job["created_at"],
            } for job in JOB_REGISTRY.values()
                if job.get("uploaded_by") == current_user.username and job["doc_id"] not in known_ids)
            return records
    except Exception:
        return [{
            "id": job["doc_id"],
            "title": job["filename"],
            "status": job["status"],
            "chunk_count": 0,
            "created_at": job["created_at"],
        } for job in JOB_REGISTRY.values() if job.get("uploaded_by") == current_user.username]


@router.get("/documents/{doc_id}/suggestions")
async def suggest_document_questions(doc_id: str, authorization: Optional[str] = Header(None)):
    current_user = await _resolve_user_optional(authorization)
    try:
        uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID.")

    from Ingestion.embedder import get_document_chunks
    chunks = get_document_chunks(current_user.username or "guest_user", doc_id)
    document_text = "\n\n".join(chunk.get("chunk_text", "") for chunk in chunks)
    if not document_text:
        raise HTTPException(status_code=404, detail="No indexed text was found for this document.")

    questions = []
    try:
        import ollama
        response = ollama.chat(
            model=os.getenv("CHAT_MODEL", "llama3"),
            messages=[{
                "role": "user",
                "content": (
                    "Write exactly five concise, distinct questions answerable from the supplied document. "
                    "Return one question per line, no numbering.\n\nDocument:\n" + document_text[:12000]
                ),
            }],
            options={"temperature": 0.2},
        )
        questions = [
            line.strip().lstrip("-•0123456789. ")
            for line in response["message"]["content"].splitlines()
            if line.strip()
        ][:5]
    except Exception:
        pass

    if len(questions) != 5:
        questions = [
            "Summarize the document's main conclusions.",
            "What key figures or metrics does it report?",
            "What risks, limitations, or uncertainties are discussed?",
            "Which tables contain the most important evidence?",
            "What changed over time, and what evidence supports it?",
        ]
    return {"doc_id": doc_id, "questions": questions}