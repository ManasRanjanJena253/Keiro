from typing import Union, Literal
from google import genai
import numpy as np
from openai import OpenAI
from embeddings.base_embedder import BaseEmbedder
from reranker.cross_encoder_reranker import CrossEncoderReranker
from vectorstore.chroma_store import ChromaStore
from .retriever import BaseRetriever


# noinspection PyTypeChecker
class ComplexRetriever(BaseRetriever):
    def __init__(self, embedder: BaseEmbedder, store: ChromaStore, client: Union[genai.Client, OpenAI], model_name: str, mmr_lambda: float, cross_encoder: CrossEncoderReranker, model_provider: Literal["openai", "ollama", "gemini"]):
        super().__init__(embedder, store)
        self.llm_client = client
        self.model = model_name
        self.lambda_val = mmr_lambda
        self.cross_encoder = cross_encoder
        self.llm_provider = model_provider

    def retrieve_top_k(self, namespace: str, top_k: int, query: str):
        query_embed = self.embedder.embed(query)
        hypothetical_answer_embed = self._compute_hypothesis_embedding(query)
        sub_query_embed = self._compute_sub_query_embedding(query)

        dense_retrieval = self.store.query(namespace, top_k, query_embed, return_embeddings = True)
        hypothesis_retrieval = self.store.query(namespace, top_k, hypothetical_answer_embed, return_embeddings = True)
        sub_query_retrieval = self.store.query(namespace, top_k, sub_query_embed, return_embeddings = True)

        all_retrieval = dense_retrieval["documents"][0] + hypothesis_retrieval["documents"][0] + sub_query_retrieval["documents"][0]

        dense_embeddings = dense_retrieval["embeddings"][0]
        hypothesis_embeddings = hypothesis_retrieval["embeddings"][0]
        sub_query_embeddings = sub_query_retrieval["embeddings"][0]

        all_embeddings = dense_embeddings + hypothesis_embeddings + sub_query_embeddings
        seen = set()
        cleaned_retrieval = []
        cleaned_embeddings = []

        for doc, embed in zip(all_retrieval, all_embeddings):
            if doc not in seen and len(doc.strip()) > 30:
                seen.add(doc)
                cleaned_retrieval.append(doc)
                cleaned_embeddings.append(embed)

        mmr_result = self._mmr_calc(query_embed = query_embed,
                                    candidate_docs = cleaned_retrieval,
                                    candidate_embeds = cleaned_embeddings,
                                    top_k = top_k,
                                    lambda_val = self.lambda_val)

        reranked_chunks = self.cross_encoder.rerank(query, chunks = mmr_result, top_k = top_k)

        return reranked_chunks

    def _compute_hypothesis_embedding(self, query: str):
        prompt = f"""Generate a hypothetical answer for this query,
                 try to be correct from your existing knowledge only. Keep the answer short and to the point.
                 Query : {query}"""

        hypothesis_embed = self._llm_embeddings(prompt = prompt)
        return hypothesis_embed

    def _compute_sub_query_embedding(self, query: str):
        prompt = f"""You are given a query, you need to create or ask another question that needs to be answered for proper answer of the query.
                 Query : {query}"""

        sub_query_embed = self._llm_embeddings(prompt = prompt)

        return sub_query_embed

    def _mmr_calc(self, query_embed: list[float], candidate_docs: list[str],candidate_embeds: list[list[float]], top_k: int, lambda_val: float) -> list[str]:
        query_embed = np.array(query_embed)
        candidate_embeds = np.array(candidate_embeds)

        query_norm = query_embed / np.linalg.norm(query_embed)
        candidate_norms = candidate_embeds / (np.linalg.norm(candidate_embeds, axis = 1, keepdims = True) + 1e-9)    # Adding this small value to prevent division by zero error

        relevance_scores = candidate_norms @ query_norm

        selected_indices = []
        remaining_indices = list(range(len(candidate_docs)))

        for _ in range(min(top_k, len(candidate_docs))):
            if not selected_indices:
                best_idx = int(np.argmax(relevance_scores))
            else:
                selected_embeds = candidate_norms[selected_indices]
                similarity_to_selected = candidate_norms[remaining_indices] @ selected_embeds.T
                max_similarity = similarity_to_selected.max(axis=1)
                relevance = relevance_scores[remaining_indices]
                mmr_scores = lambda_val * relevance - (1 - lambda_val) * max_similarity
                best_idx = remaining_indices[int(np.argmax(mmr_scores))]

            selected_indices.append(best_idx)
            remaining_indices.remove(best_idx)

        return [candidate_docs[i] for i in selected_indices]

    def _llm_embeddings(self, prompt: str):
        if self.llm_provider == "gemini":
            try:
                hypothesis_answer = self.llm_client.models.generate_content(model = self.model,
                                                                            contents = prompt)
                return self.embedder.embed(str(hypothesis_answer.text))

            except Exception as e:
                raise ValueError(f"Unable to generate hypothesis answer in Complex Retriever, ERROR: {e}")

        elif self.llm_provider in ["openai", "ollama"]:
            try:
                hypothesis_answer = self.llm_client.chat.completions.create(
                    model = self.model,
                    messages = [
                        {"role": "user", "content": prompt}
                    ]
                )

                return self.embedder.embed(str(hypothesis_answer.choices[0].message.content))
            except Exception as e:
                raise ValueError(f"Unable to generate answer in Complex Retriever, ERROR: {e}")
        else:
            raise ValueError("Unidentified model provider given")