import sys
import os
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../generated/python"))

import grpc
from generated.python import rag_pb2_grpc
from generated.python import rag_pb2
from concurrent import futures

class ComputeEmbeddings(rag_pb2_grpc.IntelligenceServiceServicer):
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
        return super().IngestDocument(request = request, context = context)



load_dotenv()

def serve():
    PORT = os.getenv("INTELLIGENCE_PORT")
    HOST = "0.0.0.0"
    server = grpc.server(futures.ThreadPoolExecutor(max_workers = 10))
    rag_pb2_grpc.add_IntelligenceServiceServicer_to_server(ComputeEmbeddings(), server)
    server.add_insecure_port(f"{HOST}:{PORT}")
    print(f"Starting the server at port {HOST}:{PORT}")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
