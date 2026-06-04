from .query_classifier import ResponseSchema

def get_config(query_details: ResponseSchema):

    if query_details.query_type == "simple":
        retrieval_type = "RETRIEVAL_TYPE_UNSPECIFIED"
        if query_details.domain is not None:
            retrieval_type = "HYBRID"
        return {
            "retrieval_type": retrieval_type,
            "top_k": 3,
            "rerank": False,
            "decompose": False
        }

    elif query_details.query_type == "complex":
        return {
            "retrieval_type": "MULTI_VECTOR",
            "top_k": 8,
            "rerank": True,
            "decompose": False
        }

    elif query_details.query_type == "multi_hop":
        return {
            "retrieval_type": "SELF_QUERYING",
            "top_k": 3,
            "rerank": False,
            "decompose": True
        }

    else:
        return {
            "retrieval_type": "RETRIEVAL_TYPE_UNSPECIFIED",
            "top_k": 3,
            "rerank": False,
            "decompose": False
        }