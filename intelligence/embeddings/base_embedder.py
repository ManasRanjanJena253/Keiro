class BaseEmbedder:
    def embed(self, text : str):
        raise NotImplementedError

    def embed_batch(self, text : list[str]):
        raise NotImplementedError