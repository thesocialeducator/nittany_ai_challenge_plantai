"""
index_documents.py — One-time script to embed all docs/ files and save to vector_store.json.

Usage:
    cd plantai-backend
    python index_documents.py
"""

import os
import json
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY   = os.environ.get("NVIDIA_API_KEY")
DOCS_DIR         = os.path.join(os.path.dirname(__file__), "docs")
VECTOR_STORE_OUT = os.path.join(os.path.dirname(__file__), "vector_store.json")

CHUNK_SIZE    = 500   # characters per chunk
CHUNK_OVERLAP = 50    # character overlap between consecutive chunks


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping character-level chunks."""
    chunks = []
    start  = 0
    while start < len(text):
        end   = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks


# ── Embedding ─────────────────────────────────────────────────────────────────

async def embed_text(text: str, client: httpx.AsyncClient) -> list[float]:
    """Call NVIDIA NemoRetriever and return embedding as list of floats."""
    r = await client.post(
        "https://integrate.api.nvidia.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "nvidia/nv-embed-v1",
            "input": text,
            "encoding_format": "float",
        },
        timeout=30.0,
    )
    r.raise_for_status()
    return r.json()["data"][0]["embedding"]


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not NVIDIA_API_KEY:
        print("ERROR: NVIDIA_API_KEY not set in .env")
        return

    doc_files = [f for f in os.listdir(DOCS_DIR) if f.endswith(".txt")]
    if not doc_files:
        print(f"No .txt files found in {DOCS_DIR}")
        return

    print(f"Found {len(doc_files)} document(s): {', '.join(doc_files)}")
    print()

    all_entries = []

    async with httpx.AsyncClient() as client:
        for filename in sorted(doc_files):
            filepath = os.path.join(DOCS_DIR, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                text = f.read()

            chunks = chunk_text(text)
            print(f"[{filename}] -> {len(chunks)} chunks")

            for i, chunk in enumerate(chunks):
                print(f"  Embedding chunk {i+1}/{len(chunks)} ({len(chunk)} chars)...", end=" ", flush=True)
                try:
                    embedding = await embed_text(chunk, client)
                    all_entries.append({"text": chunk, "embedding": embedding})
                    print(f"OK ({len(embedding)}-dim)")
                except Exception as e:
                    print(f"ERROR: {e}")

            print()

    with open(VECTOR_STORE_OUT, "w", encoding="utf-8") as f:
        json.dump(all_entries, f)

    print(f"Saved {len(all_entries)} chunks to {VECTOR_STORE_OUT}")
    size_kb = os.path.getsize(VECTOR_STORE_OUT) / 1024
    print(f"File size: {size_kb:.1f} KB")


if __name__ == "__main__":
    asyncio.run(main())
