package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/DESMG/Aldaris/internal/server/middleware"
	"github.com/DESMG/Aldaris/internal/server/resp"
	"github.com/DESMG/Aldaris/internal/server/routes"
	"github.com/DESMG/Aldaris/internal/utils"
	"github.com/gin-gonic/gin"
)

var R *gin.Engine
var server *http.Server

func InitRoutes() {
	R = gin.New()
	R.RemoveExtraSlash = true

	middleware.InitCORS()

	R.Use(gin.Recovery())
	R.Use(middleware.Logger)
	R.Use(middleware.CORS)

	R.NoRoute(resp.R404)

	R.Any("/_health", resp.R204)
	routes.RegisterPprofRoutes(R)
	routes.RegisterAPIRoutes(R)

	utils.Log.Debugln("[GIN] Routes initialized.")

	server = &http.Server{Addr: "0.0.0.0:9501", Handler: R}
}

func Start() error {
	utils.Log.Infoln("[GIN] Listening and serving HTTP on:", server.Addr)
	err := server.ListenAndServe()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func Shutdown(ctx context.Context) {
	utils.Log.Infoln("[GIN] Shutting down HTTP server...")
	err := server.Shutdown(ctx)
	if err != nil {
		utils.Log.Errorln("[HTTP] Server forced to shutdown:", err)
	}
	utils.Log.Infoln("[GIN] HTTP server exited")
}
