from embeddings.base_embedder import BaseEmbedder
from vectorstore.chroma_store import ChromaStore
from .retriever import BaseRetriever
from pydantic import BaseModel
from google import genai

class ResponseSchema(BaseModel):
    next_question: str
    is_enough: bool

class MultiHopRetriever(BaseRetriever):
    def __init__(self, embedder: BaseEmbedder, store: ChromaStore, client: genai.Client, model_name: str, num_hops: int = 3):
        super().__init__(embedder, store)
        self.llm_client = client
        self.model = model_name
        self.num_hops = num_hops

    def retrieve_top_k(self, namespace: str, top_k: int, query: str):
        query_embed = self.embedder.embed(query)
        query_retrieval = self.store.query(namespace, top_k, query_embed)
        query_retrieved_chunks = query_retrieval["documents"][0]

        all_chunks = []
        all_chunks = all_chunks + query_retrieved_chunks

        raw_prompt = """You are given a query and it's related info, you need to either ask for any other info to give correct
                        correct answer or just provide the correct answer. You have to give your response in a json format i.e. 
                        {next_question: 'The question you want to ask to get more info to the original query', is_enough: 'Either True or False, this will tell if the current info is correct'}, 
                        Alongside the query, you will also be given a hop_count, This will signify the count of questions you have already asked, and if it's equal to three, you need to make the is_enough key True
                        Query: {query}, Hop Count: {hop_count}, data: {data}"""

        hop_count = 0
        while hop_count < self.num_hops:
            hop_count += 1
            hop_prompt = raw_prompt.replace("{query}", query).replace("{hop_count}", str(hop_count)).replace("{data}", str(all_chunks))

            try:
                # noinspection PyTypeChecker
                response = self.llm_client.models.generate_content(
                    model = self.model,
                    contents = hop_prompt,
                    config = {
                        'response_mime_type': "application/json",
                        "response_schema": ResponseSchema
                    }
                )

            except Exception as e:
                raise ValueError(f"Unable to generate response. ERROR: {e}")
            try:
                # noinspection PyTypeChecker
                hop_data: ResponseSchema = response.parsed
            except Exception as e:
               raise ValueError(f"Unable to parse generated response. ERROR: {e}")

            if hop_data.is_enough:
                break

            hop_query_embed = self.embedder.embed(hop_data.next_question)
            hop_retrieved_chunks = self.store.query(namespace, top_k, hop_query_embed)["documents"][0]
            all_chunks = all_chunks + hop_retrieved_chunks
            query = hop_data.next_question

        return all_chunks
