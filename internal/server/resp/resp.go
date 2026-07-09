package resp

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func H(code int, msg string, data any) gin.H {
	return gin.H{
		"code": code,
		"msg":  msg,
		"data": data,
	}
}

func R404(c *gin.Context) {
	c.JSON(http.StatusNotFound, H(0x400004, "Not Found", nil))
}

func R204(c *gin.Context) {
	c.Status(http.StatusNoContent)
}
