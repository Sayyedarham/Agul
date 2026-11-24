package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type Device struct {
	ID, Hostname, IP, MAC, OS, Token string
	CPU, RAM, Disk                   float64
	Uptime                           int64
	Last                             time.Time
	Approved                         bool
	Online                           bool
}
type Discovery struct {
	Hostname, IP, MAC string
	Seen              time.Time
	Registered        bool
}

var mu sync.RWMutex
var devices = map[string]*Device{}
var enrollmentTokens = map[string]time.Time{}

func id() string { b := make([]byte, 16); rand.Read(b); return hex.EncodeToString(b) }
func out(w http.ResponseWriter, v any, c int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(c)
	json.NewEncoder(w).Encode(v)
}
func bearer(r *http.Request) *Device {
	t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	mu.RLock()
	defer mu.RUnlock()
	for _, d := range devices {
		if d.Token == t {
			return d
		}
	}
	return nil
}
func scan(w http.ResponseWriter, r *http.Request) {
	cidr := r.URL.Query().Get("cidr")
	if cidr == "" {
		cidr = os.Getenv("AUTHORIZED_CIDR")
	}
	if cidr == "" {
		cidr = "192.168.1.0/24"
	}
	ip, n, e := net.ParseCIDR(cidr)
	if e != nil {
		out(w, map[string]string{"error": "invalid authorized CIDR"}, 400)
		return
	}
	o, b := n.Mask.Size()
	if b-o > 8 {
		out(w, map[string]string{"error": "scan scope must be /24 or smaller"}, 400)
		return
	}
	base := ip.To4()
	found := []Discovery{}
	var wg sync.WaitGroup
	var l sync.Mutex
	for i := 1; i < 255; i++ {
		target := net.IPv4(base[0], base[1], base[2], byte(i)).String()
		wg.Add(1)
		go func(t string) {
			defer wg.Done()
			if exec.Command("ping", "-n", "1", "-w", "350", t).Run() == nil {
				l.Lock()
				found = append(found, Discovery{Hostname: t, IP: t, Seen: time.Now()})
				l.Unlock()
			}
		}(target)
	}
	wg.Wait()
	out(w, map[string]any{"cidr": cidr, "scannedAt": time.Now(), "devices": found}, 200)
}
func enroll(w http.ResponseWriter, r *http.Request) {
	var x struct{ Hostname, IP, MAC, OS, EnrollmentToken string }
	if json.NewDecoder(r.Body).Decode(&x) != nil || x.Hostname == "" {
		out(w, map[string]string{"error": "hostname required"}, 400)
		return
	}
	mu.Lock()
	expires, valid := enrollmentTokens[x.EnrollmentToken]
	if x.EnrollmentToken == "" || !valid || time.Now().After(expires) {
		mu.Unlock()
		out(w, map[string]string{"error": "invalid or expired enrollment token"}, 401)
		return
	}
	delete(enrollmentTokens, x.EnrollmentToken)
	d := &Device{ID: id(), Hostname: x.Hostname, IP: x.IP, MAC: x.MAC, OS: x.OS, Token: id()}
	devices[d.ID] = d
	mu.Unlock()
	out(w, map[string]any{"device": d, "enrollmentToken": d.Token}, 201)
}
func createEnrollmentToken(w http.ResponseWriter, r *http.Request) {
	token := id()
	expires := time.Now().Add(15 * time.Minute)
	mu.Lock()
	enrollmentTokens[token] = expires
	mu.Unlock()
	out(w, map[string]any{"token": token, "expiresAt": expires}, 201)
}
func approve(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/devices/"), "/approve")
	mu.Lock()
	d := devices[key]
	if d != nil {
		d.Approved = true
	}
	mu.Unlock()
	if d == nil {
		out(w, map[string]string{"error": "not found"}, 404)
		return
	}
	out(w, d, 200)
}
func telemetry(w http.ResponseWriter, r *http.Request) {
	d := bearer(r)
	if d == nil {
		out(w, map[string]string{"error": "unauthorized"}, 401)
		return
	}
	if !d.Approved {
		out(w, map[string]string{"error": "device awaiting administrator approval"}, 403)
		return
	}
	var x struct {
		CPU, RAM, Disk float64
		Uptime         int64
		OS             string
	}
	if json.NewDecoder(r.Body).Decode(&x) != nil {
		out(w, map[string]string{"error": "invalid telemetry"}, 400)
		return
	}
	mu.Lock()
	d.CPU, d.RAM, d.Disk, d.Uptime, d.OS, d.Last = x.CPU, x.RAM, x.Disk, x.Uptime, x.OS, time.Now()
	d.Online = true
	mu.Unlock()
	out(w, map[string]string{"status": "accepted"}, 202)
}
func main() {
	h := http.DefaultServeMux
	_ = h
	http.HandleFunc("/api/discovery/scan", scan)
	http.HandleFunc("/api/enrollment-tokens", createEnrollmentToken)
	http.HandleFunc("/api/agents/enroll", enroll)
	http.HandleFunc("/api/agents/telemetry", telemetry)
	http.HandleFunc("/api/devices/", approve)
	http.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		a := []*Device{}
		for _, d := range devices {
			d.Online = !d.Last.IsZero() && time.Since(d.Last) < 150*time.Second
			a = append(a, d)
		}
		out(w, a, 200)
	})
	log.Println("Observatory API :8080")
	log.Fatal(http.ListenAndServe(":8080", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.DefaultServeMux.ServeHTTP(w, r)
	})))
}
