from enum import IntEnum
from pydantic import BaseModel, Field


class RetrievalType(IntEnum):
    UNSPECIFIED = 0
    HYBRID      = 1   # simple tier — top-2, no reranking
    SELF_QUERYING = 2 # multi-hop tier — iterative, max 3 hops
    MULTI_VECTOR  = 3 # complex tier — top-8, MMR + cross-encoder


class JobStatus(IntEnum):
    PENDING    = 0
    PROCESSING = 1
    COMPLETE   = 2
    FAILED     = 3


class RetrievalDetails(BaseModel):
    retrieval_type: RetrievalType
    top_k: int

    @property
    def tier_name(self) -> str:
        return {
            RetrievalType.HYBRID:        "simple",
            RetrievalType.SELF_QUERYING: "multi_hop",
            RetrievalType.MULTI_VECTOR:  "complex",
        }.get(self.retrieval_type, "unspecified")


class QueryResponse(BaseModel):
    response:          str
    prompt_tokens:     int
    completion_tokens: int = Field(alias="completion_token")
    response_model:    str
    cache_hit:         bool
    retrieval_details: RetrievalDetails

    model_config = {"populate_by_name": True}

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class IngestResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id:     str
    job_status: JobStatus
    error:      str = ""

    @property
    def is_terminal(self) -> bool:
        return self.job_status in (JobStatus.COMPLETE, JobStatus.FAILED)

    @property
    def is_complete(self) -> bool:
        return self.job_status == JobStatus.COMPLETE

    @property
    def is_failed(self) -> bool:
        return self.job_status == JobStatus.FAILED