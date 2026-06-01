from .base_embedder import BaseEmbedder
from sentence_transformers import SentenceTransformer as sentTf
from dotenv import load_dotenv
import os

load_dotenv()
class LocalEmbedder(BaseEmbedder):
    def __init__(self):
        self.Embedder = sentTf('all-MiniLM-L6-v2', token = os.getenv("HF_TOKEN"))

    def embed(self, text : str) -> list[float] :
        embeddings = self.Embedder.encode(text)
        return embeddings.tolist()

    def embed_batch(self, text : list[str]) -> list[list[float]] :
        embeddings = self.Embedder.encode(text)
        return embeddings.tolist()