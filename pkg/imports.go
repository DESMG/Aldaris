package pkg

import (
	_ "github.com/gin-gonic/gin"
	_ "github.com/sirupsen/logrus"
	_ "golang.org/x/crypto/argon2"
	_ "gorm.io/driver/mysql"
	_ "gorm.io/gorm"
)
