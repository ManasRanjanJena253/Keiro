import sys
import os
from typing import Union

from dotenv import load_dotenv
from google import genai
from sentence_transformers import CrossEncoder
from openai import OpenAI

from embeddings.base_embedder import BaseEmbedder
from embeddings.local_embedder import LocalEmbedder
from ingestion.chunker import Chunker
from ingestion.pipeline import IngestionPipeline
from llm.gemini_llm import GeminiLLM
from llm.openai_llm import OpenaiLLM
from reranker.cross_encoder_reranker import CrossEncoderReranker
from retrieval.complex_retriever import ComplexRetriever
from retrieval.multihop_retriever import MultiHopRetriever
from retrieval.simple_retriever import SimpleRetriever
from vectorstore.chroma_store import ChromaStore
from classifier.query_classifier import ClassifyQuery
from classifier.strategy_selector import get_config

import grpc
import rag_pb2
import rag_pb2_grpc
from concurrent import futures

class IntelligenceServiceServicer(rag_pb2_grpc.IntelligenceServiceServicer):
    def __init__(self, pipeline: IngestionPipeline, classifier: ClassifyQuery, simple_retriever: SimpleRetriever, complex_retriever: ComplexRetriever, multi_hop_retriever: MultiHopRetriever, embedder: BaseEmbedder, llm_client: Union[GeminiLLM, OpenaiLLM]):
        self.pipeline = pipeline
        self.classifier = classifier
        self.simple = simple_retriever
        self.complex = complex_retriever
        self.multi_hop = multi_hop_retriever
        self.llm_client = llm_client
        self.embedder = embedder

    def ComputeEmbeddings(self, request, context):
        try:
            embeddings = self.embedder.embed(request.user_query)
            return rag_pb2.ComputeEmbeddingResponse(vector_embeddings = embeddings)
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.ComputeEmbeddingResponse()

    def ClassifyQueryType(self, request, context):
        query_details = self.classifier.classify(request.user_query)

        strategy_config = get_config(query_details = query_details)

        try:
            retrieval_type = rag_pb2.RetrievalType.Value(strategy_config["retrieval_type"])
            query_type = rag_pb2.QueryType.Value(query_details.query_type.upper())

            return rag_pb2.ClassifyQueryResponse(
                query_type = query_type,
                config = rag_pb2.RetrievalConfig(
                    retrieval_type = retrieval_type,
                    top_k = strategy_config["top_k"],
                    rerank = strategy_config["rerank"],
                    decompose = strategy_config["decompose"]
                )
            )
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.ClassifyQueryResponse()

    def ExecuteRetrieval(self, request, context):
        config = request.received_config
        query = request.user_query
        namespace = request.namespace

        top_k = config.top_k
        retrieval_type = config.retrieval_type

        try:
            if retrieval_type in (rag_pb2.RetrievalType.HYBRID, rag_pb2.RetrievalType.RETRIEVAL_TYPE_UNSPECIFIED):
                chunks = self.simple.retrieve_top_k(namespace, top_k, query)

            elif retrieval_type == rag_pb2.RetrievalType.MULTI_VECTOR:
                chunks = self.complex.retrieve_top_k(namespace, top_k, query)

            elif retrieval_type == rag_pb2.RetrievalType.SELF_QUERYING:
                chunks = self.multi_hop.retrieve_top_k(namespace, top_k, query)

            else:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details("Unknown retrieval type found")
                return rag_pb2.ExecuteRetrievalResponse(
                    retrieval_status = False
                )

            retrieved_chunks = [rag_pb2.RetrievedChunk(
                text = chunk,
                metadata = {},
                similarity_score = 0.0,
                source_id = ""
            ) for chunk in chunks
            ]

            return rag_pb2.ExecuteRetrievalResponse(
                retrieved_chunk = retrieved_chunks,
                retrieval_status = True
            )

        except ValueError as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.ExecuteRetrievalResponse(
                retrieval_status = False
            )

    def GenerateResponse(self, request, context):
        query = request.user_query
        namespace = request.namespace
        chunks = [chunk.text for chunk in request.retrieved_chunk]

        response = self.llm_client.get_response(query, chunks)

        return rag_pb2.GeneratedResponse(
            response = response["response"],
            prompt_tokens = response["prompt_tokens"],
            completion_tokens = response["completion_tokens"],
            model = response["model"]
        )

    def IngestDocument(self, request, context):
        namespace = request.namespace
        content = request.doc_content
        filename = request.filename
        mime_type = request.mime_type
        strategy = request.chunking_strategy

        try:
            chunk_count = self.pipeline.compute(content, namespace, strategy, mime_type, filename)
            return rag_pb2.IngestDocumentResponse(embedding_status = True,
                                                  chunk_count = chunk_count)
        except ValueError as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return rag_pb2.IngestDocumentResponse()


load_dotenv()

def serve():
    PORT = os.getenv("INTELLIGENCE_PORT")
    HOST = "0.0.0.0"
    server = grpc.server(futures.ThreadPoolExecutor(max_workers = 10))

    chroma_port = int(os.getenv("CHROMA_STORE_PORT"))
    chroma_host = os.getenv("CHROMA_STORE_HOST")
    store = ChromaStore(host = chroma_host, port = chroma_port)

    embedder_type = os.getenv("KEIRO_EMBEDDING_MODEL")
    embedder = None

    if embedder_type == "local":
        embedder = LocalEmbedder()

    elif embedder_type == "openai":
        pass
    elif embedder_type == "gemini":
        pass
    else:
        embedder = LocalEmbedder()

    llm_provider = os.getenv("KEIRO_LLM_PROVIDER")
    chunk_size = int(os.getenv("KEIRO_CHUNK_SIZE", "1024"))
    overlap = int(os.getenv("KEIRO_OVERLAP", "150"))

    chunker = Chunker(embedder, chunk_size, overlap)

    pipeline = IngestionPipeline(embedder, chunker, store)

    if os.getenv("KEIRO_DEPLOYMENT") == "True":
        if os.getenv("KEIRO_LARGE_GROQ_MODEL") != None and os.getenv("KEIRO_SMALL_GROQ_MODEL") != None:
            large_model = os.getenv("KEIRO_LARGE_GROQ_MODEL")
            small_model = os.getenv("KEIRO_SMALL_GROQ_MODEL")
            client = OpenAI(api_key = os.getenv("GROQ_API_KEY"),
                                        base_url = os.getenv("GROQ_BASE_URL"))
            llm_client = OpenaiLLM(client = client, model_name = large_model)

        else:
            raise ValueError(f"Unsupported LLM provider: {llm_provider}. Must be 'gemini' or 'openai'")

        simple_retriever = SimpleRetriever(store = store, embedder = embedder)

        classifier = ClassifyQuery(client = client, model_name = large_model, model_provider = llm_provider)

        cross_encoder_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L6-v2")
        cross_encoder = CrossEncoderReranker(cross_encoding_model = cross_encoder_model)
        complex_retriever = ComplexRetriever(store = store, embedder = embedder, client = client, cross_encoder = cross_encoder, model_name = small_model, mmr_lambda = float(os.getenv("KEIRO_MMR_RETRIEVAL_LAMBDA")), model_provider = llm_provider)

        multi_hop_retriever = MultiHopRetriever(embedder = embedder, store = store, client = client, model_name = small_model, num_hops = 3, model_provider = llm_provider)

        rag_pb2_grpc.add_IntelligenceServiceServicer_to_server(IntelligenceServiceServicer(pipeline = pipeline, classifier = classifier, simple_retriever = simple_retriever, complex_retriever = complex_retriever, multi_hop_retriever = multi_hop_retriever, embedder = embedder, llm_client = llm_client), server)
        server.add_insecure_port(f"{HOST}:{PORT}")
        print(f"Starting the server at port {HOST}:{PORT}")
        server.start()
        server.wait_for_termination()

    else :
        if llm_provider == "gemini":
            model = os.getenv("KEIRO_GEMINI_MODEL_NAME")
            client = genai.Client(api_key = os.getenv("GEMINI_API_KEY"))
            llm_client = GeminiLLM(client = client, model_name = model)

        elif llm_provider == "openai":
            model = os.getenv("KEIRO_OPENAI_MODEL_NAME")
            client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
            llm_client = OpenaiLLM(client = client, model_name = model)

        elif llm_provider == "ollama":
            model = os.getenv("KEIRO_OLLAMA_MODEL_NAME")
            model_url = os.getenv("KEIRO_OLLAMA_URL")
            client = OpenAI(
                base_url = model_url
            )
            llm_client = OpenaiLLM(client = client, model_name = model)

        elif os.getenv("KEIRO_LARGE_GROQ_MODEL") != None and os.getenv("KEIRO_SMALL_GROQ_MODEL") != None:
            model = os.getenv("KEIRO_LARGE_GROQ_MODEL")

        else:
            raise ValueError(f"Unsupported LLM provider: {llm_provider}. Must be 'gemini' or 'openai'")

        simple_retriever = SimpleRetriever(store = store, embedder = embedder)

        classifier = ClassifyQuery(client = client, model_name = model, model_provider = llm_provider)

        cross_encoder_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L6-v2")
        cross_encoder = CrossEncoderReranker(cross_encoding_model = cross_encoder_model)
        complex_retriever = ComplexRetriever(store = store, embedder = embedder, client = client, cross_encoder = cross_encoder, model_name = model, mmr_lambda = float(os.getenv("KEIRO_MMR_RETRIEVAL_LAMBDA")), model_provider = llm_provider)

        multi_hop_retriever = MultiHopRetriever(embedder = embedder, store = store, client = client, model_name = model, num_hops = 3, model_provider = llm_provider)

        rag_pb2_grpc.add_IntelligenceServiceServicer_to_server(IntelligenceServiceServicer(pipeline = pipeline, classifier = classifier, simple_retriever = simple_retriever, complex_retriever = complex_retriever, multi_hop_retriever = multi_hop_retriever, embedder = embedder, llm_client = llm_client), server)
        server.add_insecure_port(f"{HOST}:{PORT}")
        print(f"Starting the server at port {HOST}:{PORT}")
        server.start()
        server.wait_for_termination()

if __name__ == "__main__":
    serve()
