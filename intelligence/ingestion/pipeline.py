from embeddings.base_embedder import BaseEmbedder
from .chunker import Chunker
from .document_loader import load_document
from vectorstore.chroma_store import ChromaStore

class IngestionPipeline:
    def __init__(self, embedder: BaseEmbedder, chunker: Chunker, store: ChromaStore):
        self.embedder = embedder
        self.chunker = chunker
        self.store = store

    def compute(self, content: bytes, namespace: str, strat: int, mime_type: str, filename):
        try:
            text_content = load_document(content, mime_type)
        except Exception as e:
            raise ValueError(f"Document Loading failed: {e}")

        try:
            chunks = self.chunker.chunk(text_content, strat)
        except Exception as e:
            raise ValueError(f"Document Chunking failed: {e}")

        try:
            embeddings = self.embedder.embed_batch(chunks)
        except Exception as e:
            raise ValueError(f"Document embedding generation failed: {e}")

        self.store.upsert(namespace, chunks, embeddings, filename)
        return len(chunks)