import uuid

import pytest

from Ingestion import embedder, pdf_extractor
from Routers import upload


@pytest.mark.asyncio
async def test_pdf_ingestion_indexes_page_chunks_with_document_id(monkeypatch, tmp_path):
    job_id = str(uuid.uuid4())
    file_path = tmp_path / "annual-report.pdf"
    file_path.write_bytes(b"test pdf")
    upload.JOB_REGISTRY[job_id] = {"status": "queued", "progress": 0}
    indexed = {}

    monkeypatch.setattr(
        pdf_extractor,
        "extract_pdf_content",
        lambda path: (["Revenue was $120 million." , "Operating margin was 18 percent."], [], []),
    )
    monkeypatch.setattr(embedder, "embed_and_store_chunks", lambda **kwargs: indexed.update(kwargs))

    import Database

    def unavailable_sql_catalog():
        raise RuntimeError("SQL catalog offline")

    monkeypatch.setattr(Database, "async_session_factory", unavailable_sql_catalog)

    await upload.execute_ingestion_pipeline(job_id, file_path, file_path.name, "guest_user")

    assert upload.JOB_REGISTRY[job_id]["status"] == "completed"
    assert indexed["parent_asset_id"] == job_id
    assert indexed["extra_metadata"]["document_id"] == job_id
    assert indexed["chunk_metadata"] == [{"page_number": 1}, {"page_number": 2}]
    assert len(indexed["chunks"]) == 2


@pytest.mark.asyncio
async def test_scanned_pdf_pages_contribute_searchable_chunks(monkeypatch, tmp_path):
    job_id = str(uuid.uuid4())
    file_path = tmp_path / "scanned-contract.pdf"
    file_path.write_bytes(b"scanned pdf bytes")
    upload.JOB_REGISTRY[job_id] = {"status": "queued", "progress": 0}
    indexed = {}

    # Scanned PDF: page 1 has empty text, but an extracted image; page 2 has empty text
    monkeypatch.setattr(
        pdf_extractor,
        "extract_pdf_content",
        lambda path: (["", ""], [], ["extracted_images/page_1_scanned_page.png"]),
    )
    monkeypatch.setattr(embedder, "embed_and_store_chunks", lambda **kwargs: indexed.update(kwargs))

    import Database
    monkeypatch.setattr(Database, "async_session_factory", lambda: (_ for _ in ()).throw(RuntimeError("offline")))

    await upload.execute_ingestion_pipeline(job_id, file_path, file_path.name, "guest_user")

    assert upload.JOB_REGISTRY[job_id]["status"] == "completed"
    assert len(indexed["chunks"]) >= 2
    # Page 1 and 2 contributed chunks with correct page numbers
    page_numbers = [m.get("page_number") for m in indexed["chunk_metadata"]]
    assert 1 in page_numbers
    assert 2 in page_numbers

