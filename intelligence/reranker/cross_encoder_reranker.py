from sentence_transformers import CrossEncoder


class CrossEncoderReranker:
    def __init__(self, cross_encoding_model: CrossEncoder):
        self.cross_encoder = cross_encoding_model

    def rerank(self, query: str, chunks: list[str], top_k: int):
        query_chunk_pair = [(query, chunk) for chunk in chunks]
        scores = self.cross_encoder.predict(query_chunk_pair)

        scored_chunks = sorted(zip(chunks, scores), key = lambda x: x[1], reverse = True)
        return [chunk for chunk, score in scored_chunks]
