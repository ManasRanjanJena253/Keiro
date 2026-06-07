# Hybrid retrieval

from rank_bm25 import BM25Okapi
from embeddings.base_embedder import BaseEmbedder
from .retriever import BaseRetriever
from vectorstore.chroma_store import ChromaStore


class SimpleRetriever(BaseRetriever):
    def __init__(self, store: ChromaStore, embedder: BaseEmbedder):
        super().__init__(embedder, store)
        self.store = store
        self.embedder = embedder

    def retrieve_top_k(self, namespace: str, top_k: int, query: str) -> list[str]:
        query_embed = self.embedder.embed(query)
        dense_result = self.store.query(namespace, top_k, query_embed)
        dense_chunks = dense_result["documents"][0]
        dense_chunks = [chunk for chunk in dense_chunks if len(chunk.strip()) > 30]

        all_chunks_result = self.store.get_all_chunks(namespace)
        all_docs = [chunk for chunk in all_chunks_result if len(chunk.strip()) > 30]

        if not all_docs:
            return dense_chunks
        
        tokenized_corpus = [doc.lower().split() for doc in all_docs]
        tokenized_query = query.lower().split()
        bm25 = BM25Okapi(tokenized_corpus)
        sparse_chunks = bm25.get_top_n(tokenized_query, all_docs, n=top_k)

        rrf_scores = {}

        for rank, chunk in enumerate(dense_chunks, start=1):
            rrf_scores[chunk] = rrf_scores.get(chunk, 0) + 1 / (60 + rank)

        for rank, chunk in enumerate(sparse_chunks, start=1):
            rrf_scores[chunk] = rrf_scores.get(chunk, 0) + 1 / (60 + rank)

        sorted_chunks = sorted(rrf_scores, key=lambda c: rrf_scores[c], reverse=True)

        return sorted_chunks[:top_k]
