package routes

import (
	"net/http"
	"net/http/pprof"

	"github.com/gin-gonic/gin"
)

func RegisterPprofRoutes(R *gin.Engine) {
	R.GET("/_health/pprof/", gin.WrapH(http.HandlerFunc(pprof.Index)))

	R.GET("/_health/pprof/allocs", gin.WrapH(pprof.Handler("allocs")))
	R.GET("/_health/pprof/block", gin.WrapH(pprof.Handler("block")))
	R.GET("/_health/pprof/cmdline", gin.WrapF(pprof.Cmdline))
	R.GET("/_health/pprof/goroutine", gin.WrapH(pprof.Handler("goroutine")))
	R.GET("/_health/pprof/heap", gin.WrapH(pprof.Handler("heap")))
	R.GET("/_health/pprof/mutex", gin.WrapH(pprof.Handler("mutex")))
	R.GET("/_health/pprof/profile", gin.WrapF(pprof.Profile))
	R.GET("/_health/pprof/symbol", gin.WrapF(pprof.Symbol))
	R.GET("/_health/pprof/threadcreate", gin.WrapH(pprof.Handler("threadcreate")))
	R.GET("/_health/pprof/trace", gin.WrapF(pprof.Trace))
}
