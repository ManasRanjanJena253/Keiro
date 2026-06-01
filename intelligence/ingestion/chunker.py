from math import sqrt
from embeddings.base_embedder import BaseEmbedder
from semantic_text_splitter import TextSplitter

def calculate_cosine_similarity(embed_a: list[float], embed_b: list[float]):
    dot_prod = 0
    a_sq_sum = 0
    b_sq_sum = 0

    for i in range(len(embed_a)):
        dot_prod += embed_a[i] * embed_b[i]
        a_sq_sum += embed_a[i] ** 2
        b_sq_sum += embed_b[i] ** 2

    a_mag, b_mag = sqrt(a_sq_sum), sqrt(b_sq_sum)
    cosine_sim = dot_prod / (a_mag * b_mag)
    return cosine_sim

class Chunker:
    def __init__(self, embedder: BaseEmbedder, chunk_size: int, overlap: int):
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.embedder = embedder
        self.text_splitter = TextSplitter(capacity = self.chunk_size, overlap = self.overlap)

    def chunk(self, text: str, strategy: int) -> list[str] :
        if strategy == 0 or strategy == 1 :
            return self._fixed_size(text)

        if strategy == 2 :
            return self._structural(text)

        if strategy == 3 :
            return self._semantic(text)

        else:
            raise ValueError("Enter correct strategy")


    def _fixed_size(self, text: str):
       return self.text_splitter.chunks(text)

    def _structural(self, text: str):
        return text.split("\f")  # Splitting the text according to each page content.

    def _semantic(self, text: str):
        sentences = text.split(". ")
        embeddings = self.embedder.embed_batch(sentences)
        chunks = []
        chunk = [sentences[0]]
        for k in range(1, len(embeddings)):
            sim = calculate_cosine_similarity(embeddings[k - 1], embeddings[k])
            if sim > 0.90 :
                chunk.append(sentences[k])
            else:
                chunks.append(". ".join(chunk))
                chunk = [sentences[k]]
        if chunk:
            chunks.append(". ".join(chunk))
        return chunks
