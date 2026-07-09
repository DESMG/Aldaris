package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/DESMG/Aldaris/internal/server"
	"github.com/DESMG/Aldaris/internal/utils"
)

var ctx context.Context
var cancel context.CancelFunc

func main() {
	err := utils.InitLogger()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel = signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	server.InitRoutes()

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.Start()
	}()

	select {
	case <-ctx.Done():
	case err := <-serverErr:
		if err != nil {
			utils.Log.Fatalln("[GIN] HTTP server exited:", err)
		}
		return
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer shutdownCancel()
	server.Shutdown(shutdownCtx)
}
