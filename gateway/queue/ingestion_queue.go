package queue

import (
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
				tracker.UpdateStatus(job.jobId, Processing, "")
				_, err := ingestionStruct.intelClient.IngestDocument(ctx, job.jobDetails)
				if err != nil {
					tracker.UpdateStatus(job.jobId, Failed, err.Error())
				} else {
					tracker.UpdateStatus(job.jobId, Completed, "")
				}
			case <-ctx.Done():
				return
			}

		}
	}()
	return ingestionStruct

}

func (queue *IngestionQueue) Enqueue(job jobChannelStruct) error {
	for {
		select {
		case queue.jobCh <- job:
			return nil
		default:
			return errors.New("queue is full")
		}

	}
}
