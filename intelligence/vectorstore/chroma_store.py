from chromadb import HttpClient, Include

class ChromaStore:
    def __init__(self, host: str, port: int):
        self.HOST = host
        self.PORT = port
        self.client = HttpClient(host = self.HOST, port = self.PORT)

    def upsert(self, namespace: str, chunks: list, embeddings: list, filename: str):
        collection = self.client.get_or_create_collection(name = namespace)

        ids = [f"{filename}_{idx}" for idx in range(len(chunks))]
        metadatas = [{"source": filename, "chunk_index": idx} for idx in range(len(chunks))]
        collection.add(
            ids = ids,
            documents = chunks,
            metadatas = metadatas,
            embeddings = embeddings
        )

    def query(self, namespace: str, top_k: int, query_embed, return_embeddings: bool = False):
        try:
            collection = self.client.get_collection(name = namespace)
        except Exception as e:
            raise ValueError(f"Unable to find the namespace. Error: {e}")

        include: Include = ["documents", "distances", "metadatas"]

        if return_embeddings:
            include.append("embeddings")

        retrieved_result = collection.query(query_embeddings = query_embed,
                                            n_results = top_k,
                                            include = include,
                                            )

        return retrieved_result

    def get_all_chunks(self, namespace: str):
        collection = self.client.get_collection(name = namespace)
        all_chunks = collection.get()
        return all_chunks["documents"][0]
