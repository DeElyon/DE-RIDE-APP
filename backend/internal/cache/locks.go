package cache

import (
	"fmt"
	"time"
)

type Cooldown struct {
	Store    CacheStore
	Duration time.Duration
}

func (c Cooldown) Acquire(key string) (time.Duration, bool) {
	if c.Duration <= 0 {
		c.Duration = 120 * time.Second
	}
	marker := []byte(time.Now().UTC().Format(time.RFC3339Nano))
	if !c.Store.SetIfAbsent("cooldown:"+key, marker, c.Duration) {
		return c.Duration, false
	}
	return 0, true
}
func SeatHoldKey(trip, seat string) string { return fmt.Sprintf("seat:%s:%s", trip, seat) }
