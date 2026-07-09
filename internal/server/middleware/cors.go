package middleware

import (
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

const allowedOriginsEnv string = "ALLOWED_ORIGINS"

var allowedOrigins []*regexp.Regexp

func InitCORS() {
	allowedOrigins = loadAllowedOrigins()
}

func loadAllowedOrigins() []*regexp.Regexp {
	raw := os.Getenv(allowedOriginsEnv)
	if raw == "" {
		return nil
	}

	values := strings.Split(raw, ",")
	origins := make([]*regexp.Regexp, 0, len(values))
	for _, value := range values {
		pattern := strings.TrimSpace(value)
		if pattern == "" {
			continue
		}

		origins = append(origins, regexp.MustCompile(pattern))
	}

	return origins
}

func CORS(c *gin.Context) {
	origin := c.GetHeader("Origin")
	allowed := false
	for _, pattern := range allowedOrigins {
		if pattern.MatchString(origin) {
			allowed = true
			break
		}
	}
	if allowed {
		c.Header("Access-Control-Max-Age", "3600")
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "OPTIONS, HEAD, GET, POST, PUT, PATCH, DELETE")
	}
	if c.Request.Method == "OPTIONS" {
		if allowed {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	c.Next()
}
