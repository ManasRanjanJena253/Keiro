import sys
import os
from dotenv import load_dotenv

from embeddings.base_embedder import BaseEmbedder
from embeddings.local_embedder import LocalEmbedder
from ingestion.chunker import Chunker
from ingestion.pipeline import IngestionPipeline
from vectorstore.chroma_store import ChromaStore

import grpc
import rag_pb2
import rag_pb2_grpc
from concurrent import futures

class IntelligenceServiceServicer(rag_pb2_grpc.IntelligenceServiceServicer):
    def __init__(self, pipeline: IngestionPipeline):
        self.pipeline = pipeline

    def ComputeEmbeddings(self, request, context):
        return super().ComputeEmbeddings(request, context)

    def ClassifyQueryType(self, request, context):
        return rag_pb2.ClassifyQueryResponse(
            query_type = 1,
            config = rag_pb2.RetrievalConfig(
                retrieval_type = 3,
                top_k = 5,
                rerank = True,
                decompose = False,
            )
        )

    def ExecuteRetrieval(self, request, context):
        return super().ExecuteRetrieval(request = request, context = context)

    def GenerateResponse(self, request, context):
        return super().GenerateResponse(request = request, context = context)

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
    embedder = BaseEmbedder()

    if embedder_type == "local":
        embedder = LocalEmbedder()

    elif embedder_type == "openai":
        pass
    elif embedder_type == "gemini":
        pass
    else:
        embedder = LocalEmbedder()

    chunk_size = int(os.getenv("KEIRO_CHUNK_SIZE", "512"))
    overlap = int(os.getenv("KEIRO_OVERLAP", "100"))

    chunker = Chunker(embedder, chunk_size, overlap)

    pipeline = IngestionPipeline(embedder, chunker, store)

    rag_pb2_grpc.add_IntelligenceServiceServicer_to_server(IntelligenceServiceServicer(pipeline), server)
    server.add_insecure_port(f"{HOST}:{PORT}")
    print(f"Starting the server at port {HOST}:{PORT}")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
