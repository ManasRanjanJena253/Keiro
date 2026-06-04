package queue

import (
	"Keiro/gateway/metrics"
	pb "Keiro/generated/go/proto"
	"context"
	"errors"

	"github.com/google/uuid"
)

type jobChannelStruct struct {
	jobId      uuid.UUID
	jobDetails *pb.IngestDocumentRequest
}

type IngestionQueue struct {
	tracker     *JobTracker
	intelClient pb.IntelligenceServiceClient
	jobCh       chan (jobChannelStruct)
}

func NewIngestionQueue(ctx context.Context, tracker *JobTracker, client pb.IntelligenceServiceClient) *IngestionQueue {
	jobChannel := make(chan jobChannelStruct, 254)
	ingestionStruct := &IngestionQueue{
		tracker:     tracker,
		intelClient: client,
		jobCh:       jobChannel,
	}
	go func() {
		for {
			select {
			case job := <-ingestionStruct.jobCh:
				metrics.ActiveIngestionJobs.Inc()

				tracker.UpdateStatus(job.jobId, Processing, "")
				_, err := ingestionStruct.intelClient.IngestDocument(ctx, job.jobDetails)
				if err != nil {
					metrics.ActiveIngestionJobs.Dec()
					tracker.UpdateStatus(job.jobId, Failed, err.Error())
				} else {
					metrics.ActiveIngestionJobs.Dec()
					tracker.UpdateStatus(job.jobId, Completed, "")
				}
			case <-ctx.Done():
				return
			}

		}
	}()
	return ingestionStruct

}

func (queue *IngestionQueue) Enqueue(id uuid.UUID, details *pb.IngestDocumentRequest) error {
	job := jobChannelStruct{
		jobId:      id,
		jobDetails: details,
	}
	for {
		select {
		case queue.jobCh <- job:
			return nil
		default:
			return errors.New("queue is full")
		}

	}
}
