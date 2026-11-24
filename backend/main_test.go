package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestEnrollmentRequiresOneTimeTokenAndApproval(t *testing.T) {
	mu.Lock()
	devices = map[string]*Device{}
	enrollmentTokens = map[string]time.Time{}
	mu.Unlock()
	tokenRequest := httptest.NewRequest(http.MethodPost, "/api/enrollment-tokens", nil)
	tokenResponse := httptest.NewRecorder()
	createEnrollmentToken(tokenResponse, tokenRequest)
	var token struct{ Token string }
	json.NewDecoder(tokenResponse.Result().Body).Decode(&token)
	payload, _ := json.Marshal(map[string]string{"hostname": "LAB-PC-01", "enrollmentToken": token.Token})
	enrollResponse := httptest.NewRecorder()
	enroll(enrollResponse, httptest.NewRequest(http.MethodPost, "/api/agents/enroll", bytes.NewReader(payload)))
	if enrollResponse.Code != http.StatusCreated {
		t.Fatalf("enroll = %d", enrollResponse.Code)
	}
	var result struct {
		Device          Device
		EnrollmentToken string
	}
	json.NewDecoder(enrollResponse.Result().Body).Decode(&result)
	data := []byte("{\"CPU\":50,\"RAM\":40,\"Disk\":20}")
	rejected := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/agents/telemetry", bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+result.EnrollmentToken)
	telemetry(rejected, req)
	if rejected.Code != http.StatusForbidden {
		t.Fatalf("unapproved telemetry = %d", rejected.Code)
	}
	approved := httptest.NewRecorder()
	approve(approved, httptest.NewRequest(http.MethodPost, "/api/devices/"+result.Device.ID+"/approve", nil))
	accepted := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/agents/telemetry", bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+result.EnrollmentToken)
	telemetry(accepted, req)
	if accepted.Code != http.StatusAccepted {
		t.Fatalf("approved telemetry = %d", accepted.Code)
	}
}
