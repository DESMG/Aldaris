.PHONY: all tidy update fmt test build

LD_FLAGS := \
    -s \
	-w \

BUILD_FLAGS := \
	-trimpath \
	-buildvcs=false \

BUILD_ENV := \
    CGO_ENABLED=0 \
	GOOS=linux \
	GOARCH=amd64 \
	GOAMD64=v3 \

all: fmt test build

tidy:
	go mod tidy

update:
	go get -u ./...

fmt:
	go fmt ./...

test:
	go test -v ./...

build: fmt test
	$(BUILD_ENV) go build -ldflags "$(LD_FLAGS)" $(BUILD_FLAGS) -o bin/main ./cmd
