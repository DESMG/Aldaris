package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
)

func Logger(c *gin.Context) {
	start := time.Now()
	c.Next()
	param := gin.LogFormatterParams{
		StatusCode:   c.Writer.Status(),
		Latency:      time.Since(start),
		ClientIP:     c.ClientIP(),
		Method:       c.Request.Method,
		Path:         c.Request.URL.Path,
		ErrorMessage: c.Errors.ByType(gin.ErrorTypePrivate).String(),
	}
	// statusColor := param.StatusCodeColor()
	// methodColor := param.MethodColor()
	// resetColor := param.ResetColor()
	if param.Latency > time.Minute {
		param.Latency = param.Latency.Truncate(time.Second)
	}
	// utils.Log.Printf("[GIN] %s%3d%s|%13v|%15s|%s%-7s%s|%#v\n%s",
	// 	statusColor, param.StatusCode, resetColor,
	// 	param.Latency,
	// 	param.ClientIP,
	// 	methodColor, param.Method, resetColor,
	// 	param.Path,
	// 	param.ErrorMessage,
	// )
}
