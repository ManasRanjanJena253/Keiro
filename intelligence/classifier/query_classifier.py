import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../generated/python"))

import grpc
import logging
from generated.python import rag_pb2_grpc, rag_pb2

logging.basicConfig(level = logging.INFO)
logger = logging.getLogger(__name__)

def run():
    with grpc.insecure_channel("localhost:28080") as channel:
        stub = rag_pb2_grpc.IntelligenceServiceStub(channel)

        classify_request = rag_pb2.ClassifyQueryRequest(
            user_query = "What is the refund policy ?",
            namespace= "test-namespace"
        )

        try:
            response = stub.ClassifyQueryType(classify_request)
            logger.info(
                f"ClassifyQuery response received",
                extra = {
                    "query_type": response.query_type,
                    "retrieval_type": response.config.retrieval_type,
                    "top_k": response.config.top_k,
                    "rerank": response.config.rerank,
                    "decompose": response.config.decompose,
                }
            )

        except grpc.RpcError as e:
            logger.error(f"RPC failed: {e.code()} - {e.details()}")

if __name__ == "__main__":
    run()