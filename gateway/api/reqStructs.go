package api

var ingestDocReq struct {
	MimeType string `json:"mime_type"`
	Content  []byte `json:"content"`
	FileName string `json:"file_name"`
}
