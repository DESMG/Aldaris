package utils

import (
	"fmt"
	"os"
	"strings"

	"github.com/sirupsen/logrus"
)

var Log *logrus.Logger

func InitLogger() error {
	levelStr := os.Getenv("LOG_LEVEL")
	if levelStr == "" {
		levelStr = "debug"
	}
	level, err := logrus.ParseLevel(strings.ToLower(levelStr))
	if err != nil {
		return fmt.Errorf("Invalid log level %q: %w", levelStr, err)
	}

	Log = logrus.New()
	Log.SetFormatter(&logrus.TextFormatter{
		ForceColors:               true,
		EnvironmentOverrideColors: true,
		TimestampFormat:           "2006-01-02T15:04:05.000000",
		FullTimestamp:             true,
	})

	Log.SetLevel(level)
	Log.SetOutput(os.Stdout)
	Log.SetReportCaller(true)
	Log.Infoln("[Logger] Logger initialized.")
	return nil
}
