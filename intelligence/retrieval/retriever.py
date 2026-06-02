from abc import abstractmethod
from embeddings.base_embedder import BaseEmbedder
from vectorstore.chroma_store import ChromaStore


class BaseRetriever:
    def __init__(self, embedder: BaseEmbedder, store: ChromaStore):
        self.store = store
        self.embedder = embedder

    @abstractmethod
    def retrieve_top_k(self, namespace: str, top_k: int, query: str):
        raise NotImplementedError
