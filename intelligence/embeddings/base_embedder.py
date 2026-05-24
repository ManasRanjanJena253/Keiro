import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../generated/python"))

from generated.python import rag_pb2_grpc
from generated.python import rag_pb2
import time
import grpc

def run():
    with grpc.insecure_channel("localhost:28080") as channel:
        stub = rag_pb2_grpc.IntelligenceServiceStub(channel)

        embedding_request = rag_pb2.ComputeEmbeddingRequest(
            user_query = "Testing the file"
        )