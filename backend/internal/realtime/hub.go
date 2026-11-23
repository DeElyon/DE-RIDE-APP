package realtime

import (
	"encoding/json"
	"sync"

	"github.com/fasthttp/websocket"
)

// Hub is intentionally process-local. It carries transient notifications only;
// durable chat and trip state remain in Postgres.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*Client]struct{}
}

type Client struct {
	Conn *websocket.Conn
	mu   sync.Mutex
}

func NewHub() *Hub { return &Hub{rooms: make(map[string]map[*Client]struct{})} }

func (c *Client) Send(payload any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(payload)
}

func (h *Hub) Join(room string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*Client]struct{})
	}
	h.rooms[room][client] = struct{}{}
}

func (h *Hub) Leave(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for room, clients := range h.rooms {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.rooms, room)
		}
	}
}

func (h *Hub) Broadcast(room string, payload any) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.rooms[room]))
	for client := range h.rooms[room] {
		clients = append(clients, client)
	}
	h.mu.RUnlock()
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	for _, client := range clients {
		client.mu.Lock()
		err := client.Conn.WriteMessage(websocket.TextMessage, data)
		client.mu.Unlock()
		if err != nil {
			h.Leave(client)
			_ = client.Conn.Close()
		}
	}
}
