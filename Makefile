.PHONY: all proto format clean migrateSchema startGo startPython
all : proto format clean migrateSchema

proto :
	mkdir -p generated/go/proto generated/python

	# Go proto
	protoc --proto_path=. \
		--go_out=generated/go --go_opt=module=github.com/ManasRanjanJena253/Keiro/generated/go \
		--go-grpc_out=generated/go --go-grpc_opt=module=github.com/ManasRanjanJena253/Keiro/generated/go \
		proto/rag.proto

	# Python Proto
	(cd proto && python3 -m grpc_tools.protoc --proto_path=. \
		--python_out=../generated/python \
		--grpc_python_out=../generated/python \
		rag.proto)

Go : format clean startGo

Python : startPython

format :
	go fmt ./...

clean :
	go mod tidy

startGo :
	go run gateway/main.go

startPython :
	python3 intelligence/main.py

migrateSchema :
	sqlc generate
