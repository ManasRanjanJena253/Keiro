package queue

import (
	"errors"
	"sync"

	"github.com/google/uuid"
)

type Status int

const (
	Pending = iota
	Processing
	Completed
	Failed
)

type jobEntry struct {
	jobStatus Status
	jobError  string
}

type JobTracker struct {
	jobsMap map[uuid.UUID]*jobEntry
	mutex   *sync.RWMutex
}

func NewJobTracker() *JobTracker {
	jobMap := make(map[uuid.UUID]*jobEntry)
	mutex := sync.RWMutex{}
	return &JobTracker{jobsMap: jobMap, mutex: &mutex}
}

func (tracker *JobTracker) CreateJob() (uuid.UUID, error) {
	tracker.mutex.Lock()
	defer tracker.mutex.Unlock()
	id, err := uuid.NewUUID()
	if err != nil {
		return uuid.Nil, err
	}
	tracker.jobsMap[id] = &jobEntry{jobError: "", jobStatus: Pending}
	return id, nil
}

func (tracker *JobTracker) UpdateStatus(id uuid.UUID, stat Status, errMsg string) {
	tracker.mutex.Lock()
	defer tracker.mutex.Unlock()
	job := tracker.jobsMap[id]
	job.jobStatus = stat
	job.jobError = errMsg
}

func (tracker *JobTracker) GetJob(id uuid.UUID) (*jobEntry, error) {
	tracker.mutex.RLock()
	defer tracker.mutex.RUnlock()
	job := tracker.jobsMap[id]
	if job == nil {
		return nil, errors.New("job not found")
	}
	return job, nil
}

func (job *jobEntry) GetStatus() Status {
	return job.jobStatus
}

func (job *jobEntry) GetJobError() string {
	return job.jobError
}
