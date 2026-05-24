package intelligence

import (
	pb "Keiro/generated/go/proto"
	"context"
	"log/slog"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func ConnectToPython() pb.IntelligenceServiceClient {
	conn, err := grpc.NewClient("localhost:28080", grpc.WithTransportCredentials(insecure.NewCredentials()))

	if err != nil {
		slog.Info("Couldn't establish connection with python server", "ERROR", err)
	}

	client := pb.NewIntelligenceServiceClient(conn)
	return client
}

func ClassifyQuery(client pb.IntelligenceServiceClient, query string, namespace string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	req := &pb.ClassifyQueryRequest{
		UserQuery: query,
		Namespace: namespace,
	}
	res, err := client.ClassifyQueryType(ctx, req)
	if err != nil {
		slog.Info("Couldn't classify Query", "ERROR", err)
		return
	}

	slog.Info(
		"Response Received",
		"Query Type", res.QueryType,
		"Retrieval Config", res.Config,
	)
}

func ComputeEmbeddings(client pb.IntelligenceServiceClient, query string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	req := &pb.ComputeEmbeddingRequest{
		UserQuery: query,
	}

	res, err := client.ComputeEmbeddings(ctx, req)
	if err != nil {
		slog.Info("Couldn't Compute Embeddings", "ERROR", err)
		return
	}

	slog.Info(
		"Response Received",
		"Received Embeddings", res.VectorEmbeddings,
	)
}

func ExecuteRetrieval(client pb.IntelligenceServiceClient, query string, config *pb.RetrievalConfig, namespace string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	req := &pb.ExecuteRetrievalRequest{
		UserQuery:      query,
		ReceivedConfig: config,
		Namespace:      namespace,
	}

	res, err := client.ExecuteRetrieval(ctx, req)
	if err != nil {
		slog.Info("Couldn't connect to ExecuteRetrieval", "ERROR", err)
		return
	}

	slog.Info(
		"ExecuteRetrieval Response",
		"Retrieved Chunk", res.RetrievedChunk,
		"Retrieval Status", res.RetrievalStatus)
}

func GenerateResponse(client pb.IntelligenceServiceClient, namespace string, query string, retrieved_chunk []*pb.RetrievedChunk) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	req := &pb.GenerateResponseRequest{
		Namespace:      namespace,
		UserQuery:      query,
		RetrievedChunk: retrieved_chunk,
	}

	res, err := client.GenerateResponse(ctx, req)
	if err != nil {
		slog.Info("Couldn't connect to GenerateResponse", "ERROR", err)
		return
	}

	slog.Info(
		"Response Generated Successfully",
		"Response", res.Response,
		"Prompt Tokens", res.PromptTokens,
		"Completion Tokens", res.CompletionTokens,
		"Model", res.Model,
	)
}

func IngestDocument(client pb.IntelligenceServiceClient, mime_type string, chunking_strat int32, namespace string, filename string, content []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	req := &pb.IngestDocumentRequest{
		DocContent:       content,
		Namespace:        namespace,
		Filename:         filename,
		MimeType:         mime_type,
		ChunkingStrategy: pb.ChunkingStrategy(chunking_strat),
	}

	res, err := client.IngestDocument(ctx, req)
	if err != nil {
		slog.Info("Couldn't connect to IngestDocument", "ERROR", err)
		return
	}

	slog.Info(
		"IngestDocument Response Received",
		"Chunk Count", res.ChunkCount,
		"Embedding Status", res.EmbeddingStatus)
}
