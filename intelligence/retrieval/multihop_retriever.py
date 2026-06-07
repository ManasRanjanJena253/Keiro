from typing import Union, Literal
from embeddings.base_embedder import BaseEmbedder
from openai import OpenAI
from vectorstore.chroma_store import ChromaStore
from .retriever import BaseRetriever
from pydantic import BaseModel
from google import genai

class MultiHopResponseSchema(BaseModel):
    next_question: str
    is_enough: bool

class MultiHopRetriever(BaseRetriever):
    def __init__(self, embedder: BaseEmbedder, store: ChromaStore, client: Union[genai.Client, OpenAI], model_name: str, model_provider: Literal["openai", "ollama", "gemini"], num_hops: int = 3):
        super().__init__(embedder, store)
        self.llm_client = client
        self.model = model_name
        self.num_hops = num_hops
        self.llm_provider = model_provider

    def retrieve_top_k(self, namespace: str, top_k: int, query: str):
        original_query = query
        curr_query = query

        query_embed = self.embedder.embed(original_query)
        query_retrieval = self.store.query(namespace, top_k, query_embed)
        query_retrieved_chunks = query_retrieval["documents"][0]

        all_chunks = []
        all_chunks = all_chunks + query_retrieved_chunks

        raw_prompt = """You are an AI research assistant. Your goal is to answer the Original Query.
                Review the retrieved context data. If the data is sufficient to answer the Original Query, set 'is_enough' to True and leave 'next_question' blank.
                If the data is insufficient, formulate a 'next_question' to search the database for the missing information. 

                Original Query: {original_query}
                Most Recent Search: {current_query}
                Hop Count: {hop_count} (If this is {max_hops}, you MUST set is_enough to True)

                Retrieved Data: 
                {data}"""

        hop_count = 0
        while hop_count < self.num_hops:
            hop_count += 1

            hop_prompt = raw_prompt.format(
                original_query = original_query,
                current_query = curr_query,
                hop_count = hop_count,
                max_hops = self.num_hops,
                data = "\n".join(all_chunks)
            )

            try:
                hop_data = self._llm_response(prompt = hop_prompt)
            except Exception as e:
                raise ValueError(f"Unable to generate response in Multi Hop retriever. ERROR: {e}")

            if hop_data.is_enough:
                break

            hop_query_embed = self.embedder.embed(hop_data.next_question)
            hop_retrieved_chunks = self.store.query(namespace, top_k, hop_query_embed)["documents"][0]
            all_chunks = all_chunks + hop_retrieved_chunks
            curr_query = hop_data.next_question

        seen = set()
        cleaned_chunks = []
        for chunk in all_chunks:
            if chunk not in seen and len(chunk.strip()) > 30:
                seen.add(chunk)
                cleaned_chunks.append(chunk)

        return cleaned_chunks

    def _llm_response(self, prompt: str):
        if self.llm_provider == "gemini":
            try:
                # noinspection PyTypeChecker
                answer = self.llm_client.models.generate_content(
                    model = self.model,
                    config = {
                        "response_mime_type": "application/json",
                        "response_schema": MultiHopResponseSchema
                    },
                    contents = prompt
                )

                try:
                    # noinspection PyTypeChecker
                    json_response: MultiHopResponseSchema = answer.parsed
                    return json_response
                except Exception as e:
                    raise ValueError(f"Unable to parse the data in Multi Hop Retriever. ERROR: {e}")

            except Exception as e:
                raise ValueError(f"Unable to generate answer in Multi Hop Retriever, ERROR: {e}")

        elif self.llm_provider in ["openai", "ollama"]:
            try:
                # noinspection PyTypeChecker
                answer = self.llm_client.chat.completions.create(
                    model = self.model,
                    response_format = {"type": "json_object"},
                    messages = [
                        {"role": "user", "content": prompt}
                    ]
                )

                try:
                    json_response = MultiHopResponseSchema.model_validate_json(str(answer.choices[0].message.content))
                    return json_response
                except Exception as e:
                    raise ValueError(f"Unable to generate answer in Multi Hop Retriever, ERROR: {e}")

            except Exception as e:
                raise ValueError(f"Unable to generate answer in Multi Hop Retriever, ERROR: {e}")
        else:
            raise ValueError("Unidentified model provider given")