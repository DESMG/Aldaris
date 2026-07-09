package routes

import (
	"strings"

	"github.com/gin-gonic/gin"
)

type NamedRoute struct {
	Name    string
	Method  string
	Path    string
	Handler gin.HandlerFunc
}

func RegisterAPIRoutes(R *gin.Engine) {
	routes := []NamedRoute{}

	maxPathLen := 0
	for _, route := range routes {
		pathLength := len(route.Path)
		if pathLength > maxPathLen {
			maxPathLen = pathLength
		}
	}

	for _, route := range routes {

		R.Handle(route.Method, route.Path, route.Handler)

		if len(route.Name) < 32+maxPathLen {
			route.Name = strings.Repeat(".", 32+maxPathLen-len(route.Name)-len(route.Path)) + route.Name
		}
		if len(route.Method) < 6 {
			route.Method = strings.Repeat(" ", 6-len(route.Method)) + route.Method
		}
		// utils.Log.Debugln("[GIN] Route registered:", route.Method, route.Path, route.Name)
	}
}
