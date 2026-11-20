package main

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/deride/ecosystem/backend/internal/cache"
	"github.com/gofiber/fiber/v2"
)

func main() {
	if os.Getenv("DATABASE_URL") == "" {
		log.Fatal("DATABASE_URL is required")
	}
	store := cache.NewMemoryStore(30 * time.Second)
	defer store.Close()
	app := fiber.New(fiber.Config{AppName: "DE RIDE API"})
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	app.Get("/api/v1/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	app.Post("/api/v1/users/switch-rider-mode", func(c *fiber.Ctx) error {
		return c.Status(501).JSON(fiber.Map{"error": "NOT_CONFIGURED", "message": "Authentication and persistence are required for rider mode switching"})
	})
	app.Get("/ws", func(c *fiber.Ctx) error {
		return c.Status(426).SendString("websocket endpoint requires authenticated upgrade")
	})
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}
