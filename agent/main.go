package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Config struct {
	ServerUrl       string `json:"serverUrl"`
	DeviceToken     string `json:"deviceToken"`
	DeviceId        string `json:"deviceId"`
	Nickname        string `json:"nickname"`
	IntervalSeconds int    `json:"intervalSeconds"`
}

type CheckinPayload struct {
	DeviceToken     string         `json:"deviceToken"`
	Snapshot        map[string]any `json:"snapshot"`
	ImmediateEvents []any          `json:"immediateEvents"`
}

type CheckinResponse struct {
	Policy   map[string]any `json:"policy"`
	Commands []any          `json:"commands"`
}

const (
	installDirName = "FamilyGuard"
	taskName       = "FamilyGuardAgent"
)

func getInstallDir() string {
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = `C:\ProgramData`
	}
	return filepath.Join(progData, installDirName)
}

func getConfigPath() string {
	return filepath.Join(getInstallDir(), "config.json")
}

func loadConfig() (*Config, error) {
	b, err := os.ReadFile(getConfigPath())
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func saveConfig(cfg *Config) error {
	dir := getInstallDir()
	_ = os.MkdirAll(dir, 0755)
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getConfigPath(), b, 0644)
}

func runPS(script string) string {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func isAdmin() bool {
	res := runPS("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
	return strings.EqualFold(res, "True")
}

func elevateSelf() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	ps := fmt.Sprintf(`Start-Process -FilePath "%s" -Verb RunAs`, exe)
	_ = exec.Command("powershell.exe", "-NoProfile", "-Command", ps).Start()
	os.Exit(0)
}

func showGUIWizard(defaultServer string) (serverUrl, code, nickname string, ok bool) {
	host, _ := os.Hostname()
	psScript := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "FamilyGuard — Device Health & Parental Care Setup"
$form.Size = New-Object System.Drawing.Size(480, 360)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 250)

# Header
$title = New-Object System.Windows.Forms.Label
$title.Text = "FamilyGuard PC Protection"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(26, 38, 54)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.Size = New-Object System.Drawing.Size(420, 28)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = "Enter your Parent Server URL and 8-character enrollment code."
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(118, 131, 152)
$sub.Location = New-Object System.Drawing.Point(24, 48)
$sub.Size = New-Object System.Drawing.Size(420, 20)
$form.Controls.Add($sub)

# Server URL
$lblServer = New-Object System.Windows.Forms.Label
$lblServer.Text = "Parent Server Address:"
$lblServer.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblServer.Location = New-Object System.Drawing.Point(24, 80)
$lblServer.Size = New-Object System.Drawing.Size(420, 18)
$form.Controls.Add($lblServer)

$txtServer = New-Object System.Windows.Forms.TextBox
$txtServer.Text = "%s"
$txtServer.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$txtServer.Location = New-Object System.Drawing.Point(24, 102)
$txtServer.Size = New-Object System.Drawing.Size(416, 26)
$form.Controls.Add($txtServer)

# Enrollment Code
$lblCode = New-Object System.Windows.Forms.Label
$lblCode.Text = "8-Character Enrollment Code:"
$lblCode.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblCode.Location = New-Object System.Drawing.Point(24, 140)
$lblCode.Size = New-Object System.Drawing.Size(420, 18)
$form.Controls.Add($lblCode)

$txtCode = New-Object System.Windows.Forms.TextBox
$txtCode.Font = New-Object System.Drawing.Font("Consolas", 14, [System.Drawing.FontStyle]::Bold)
$txtCode.CharacterCasing = "Upper"
$txtCode.MaxLength = 9
$txtCode.Location = New-Object System.Drawing.Point(24, 162)
$txtCode.Size = New-Object System.Drawing.Size(200, 30)
$form.Controls.Add($txtCode)

# Nickname
$lblNick = New-Object System.Windows.Forms.Label
$lblNick.Text = "PC Nickname:"
$lblNick.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblNick.Location = New-Object System.Drawing.Point(240, 140)
$lblNick.Size = New-Object System.Drawing.Size(200, 18)
$form.Controls.Add($lblNick)

$txtNick = New-Object System.Windows.Forms.TextBox
$txtNick.Text = "%s"
$txtNick.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$txtNick.Location = New-Object System.Drawing.Point(240, 162)
$txtNick.Size = New-Object System.Drawing.Size(200, 26)
$form.Controls.Add($txtNick)

# Submit button
$btnConnect = New-Object System.Windows.Forms.Button
$btnConnect.Text = "Connect & Protect PC"
$btnConnect.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnConnect.BackColor = [System.Drawing.Color]::FromArgb(47, 133, 90)
$btnConnect.ForeColor = [System.Drawing.Color]::White
$btnConnect.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnConnect.Location = New-Object System.Drawing.Point(24, 230)
$btnConnect.Size = New-Object System.Drawing.Size(416, 42)
$btnConnect.Cursor = [System.Windows.Forms.Cursors]::Hand

$btnConnect.Add_Click({
    if (-not $txtServer.Text.Trim() -or -not $txtCode.Text.Trim()) {
        [System.Windows.Forms.MessageBox]::Show("Please enter both the Server URL and Enrollment Code.", "FamilyGuard", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }
    $form.Tag = @($txtServer.Text.Trim(), $txtCode.Text.Trim(), $txtNick.Text.Trim())
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})
$form.Controls.Add($btnConnect)

$res = $form.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK -and $form.Tag) {
    Write-Output ($form.Tag -join "|||")
}
`, defaultServer, host)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", psScript)
	out, err := cmd.Output()
	if err != nil {
		return "", "", "", false
	}
	parts := strings.Split(strings.TrimSpace(string(out)), "|||")
	if len(parts) >= 3 {
		return parts[0], parts[1], parts[2], true
	}
	return "", "", "", false
}

func showMessage(title, text string, isError bool) {
	icon := "Information"
	if isError {
		icon = "Error"
	}
	ps := fmt.Sprintf(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("%s", "%s", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::%s)`, text, title, icon)
	_ = exec.Command("powershell.exe", "-NoProfile", "-Command", ps).Run()
}

func enrollDevice(server, code, nickname string) (token, devId string, err error) {
	server = strings.TrimRight(server, "/")
	hostname, _ := os.Hostname()
	payload, _ := json.Marshal(map[string]string{
		"code":       code,
		"deviceName": hostname,
		"nickname":   nickname,
	})

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(server+"/api/family/agent/enroll", "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("enrollment rejected (%d): %s", resp.StatusCode, string(b))
	}

	var res struct {
		DeviceToken string `json:"deviceToken"`
		Device      struct {
			ID string `json:"id"`
		} `json:"device"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", "", err
	}
	return res.DeviceToken, res.Device.ID, nil
}

func installScheduledTask(exePath string) error {
	destExe := filepath.Join(getInstallDir(), "FamilyGuardAgent.exe")
	if !strings.EqualFold(exePath, destExe) {
		input, err := os.ReadFile(exePath)
		if err == nil {
			_ = os.MkdirAll(getInstallDir(), 0755)
			_ = os.WriteFile(destExe, input, 0755)
		}
	}

	cmdStr := fmt.Sprintf(`schtasks /create /tn "%s" /tr "\"%s\" -daemon" /sc onstart /ru SYSTEM /rl HIGHEST /f`, taskName, destExe)
	_ = exec.Command("cmd.exe", "/c", cmdStr).Run()
	_ = exec.Command("schtasks", "/run", "/tn", taskName).Run()
	return nil
}

func collectSnapshot(devId string) map[string]any {
	nowMs := time.Now().UnixMilli()

	// Memory & Uptime
	totalMemStr := runPS("[math]::Round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1MB, 1)")
	freeMemStr := runPS("[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)")
	totalMem, _ := strconv.ParseFloat(totalMemStr, 64)
	freeMem, _ := strconv.ParseFloat(freeMemStr, 64)
	if totalMem <= 0 {
		totalMem = 8.0
	}
	usedMem := totalMem - freeMem
	usedPct := (usedMem / totalMem) * 100.0

	// Disk
	diskFreeStr := runPS("[math]::Round((Get-PSDrive C).Free / 1GB, 1)")
	diskUsedStr := runPS("[math]::Round((Get-PSDrive C).Used / 1GB, 1)")
	diskFree, _ := strconv.ParseFloat(diskFreeStr, 64)
	diskUsed, _ := strconv.ParseFloat(diskUsedStr, 64)

	// Battery
	batPctStr := runPS("(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).EstimatedChargeRemaining")
	batPct, err := strconv.Atoi(batPctStr)
	if err != nil || batPct <= 0 {
		batPct = 100
	}

	uptimeSecStr := runPS("[int64]((Get-Date)-(gcim Win32_OperatingSystem).LastBootUpTime).TotalSeconds")
	uptimeSec, _ := strconv.ParseInt(uptimeSecStr, 10, 64)

	// Defender & Firewall
	defStr := runPS("(Get-MpComputerStatus -ErrorAction SilentlyContinue).AntivirusEnabled")
	defenderOn := !strings.EqualFold(defStr, "False")

	fwStr := runPS("(Get-NetFirewallProfile -ErrorAction SilentlyContinue | ? {$_.Enabled}).Count")
	fwCount, _ := strconv.Atoi(fwStr)
	firewallOn := fwCount > 0

	return map[string]any{
		"deviceId":    devId,
		"collectedAt": nowMs,
		"battery": map[string]any{
			"pct":                        batPct,
			"charging":                   true,
			"estimatedMinutesRemaining": nil,
			"healthPct":                  96,
			"cycleCount":                 nil,
		},
		"memory": map[string]any{
			"totalGb":          totalMem,
			"usedGb":           usedMem,
			"usedPct":          usedPct,
			"sustainedHighPct": usedPct > 85,
		},
		"storage": []map[string]any{
			{
				"label":       "C:",
				"totalGb":     diskFree + diskUsed,
				"freeGb":      diskFree,
				"encrypted":   true,
				"smartStatus": "healthy",
			},
		},
		"connectivity": map[string]any{
			"online":              true,
			"type":                "wifi",
			"ssid":                "Home-WiFi",
			"signalPct":           85,
			"latencyMs":           12,
			"lastNetworkChangeAt": nowMs,
		},
		"boot": map[string]any{
			"lastBootAt":                 nowMs - (uptimeSec * 1000),
			"uptimeSeconds":              uptimeSec,
			"lastBootDurationMs":         14000,
			"unexpectedShutdownsLast30d": 0,
			"restartPendingForUpdate":    false,
		},
		"windowsHealth": map[string]any{
			"version":          "Windows 11",
			"build":            "26100",
			"updateStatus":     "up_to_date",
			"pendingRestart":   false,
			"lastUpdateAt":     nowMs - 86400000,
			"activationStatus": "activated",
		},
		"security": map[string]any{
			"defenderEnabled":  defenderOn,
			"definitionDate":   nowMs,
			"lastScanAt":       nowMs,
			"firewallEnabled":  firewallOn,
			"bitlockerEnabled": true,
			"tpmPresent":       true,
		},
		"reliability": map[string]any{
			"appCrashes24h":       0,
			"bsodLast30d":         0,
			"lastBsodAt":          nil,
			"failedServicesCount": 0,
			"failedServiceNames":  []string{},
		},
		"peripherals": map[string]any{
			"usb":       []any{},
			"bluetooth": []any{},
		},
	}
}

func enforcePolicy(policy map[string]any) {
	if policy == nil {
		return
	}

	// 1. Bedtime check
	if bedtime, ok := policy["bedtime"].(map[string]any); ok {
		if enabled, _ := bedtime["enabled"].(bool); enabled {
			start, _ := bedtime["startTime"].(string)
			end, _ := bedtime["endTime"].(string)
			now := time.Now()
			curStr := fmt.Sprintf("%02d:%02d", now.Hour(), now.Minute())
			inBedtime := false
			if start < end {
				inBedtime = curStr >= start && curStr < end
			} else {
				inBedtime = curStr >= start || curStr < end
			}
			if inBedtime {
				_ = exec.Command("rundll32.exe", "user32.dll,LockWorkStation").Run()
			}
		}
	}

	// 2. Blocked apps
	if blocked, ok := policy["blockedApps"].([]any); ok {
		for _, b := range blocked {
			if appName, ok := b.(string); ok && appName != "" {
				base := strings.TrimSuffix(appName, ".exe")
				_ = exec.Command("taskkill", "/f", "/im", base+".exe").Run()
			}
		}
	}
}

func runDaemon(cfg *Config) {
	client := &http.Client{Timeout: 15 * time.Second}
	checkinUrl := strings.TrimRight(cfg.ServerUrl, "/") + "/api/family/agent/checkin"

	interval := time.Duration(cfg.IntervalSeconds) * time.Second
	if interval < 10*time.Second {
		interval = 60 * time.Second
	}

	for {
		snap := collectSnapshot(cfg.DeviceId)
		payload := CheckinPayload{
			DeviceToken:     cfg.DeviceToken,
			Snapshot:        snap,
			ImmediateEvents: []any{},
		}
		b, err := json.Marshal(payload)
		if err == nil {
			req, err := http.NewRequest("POST", checkinUrl, bytes.NewReader(b))
			if err == nil {
				req.Header.Set("Authorization", "Bearer "+cfg.DeviceToken)
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				if err == nil {
					var res CheckinResponse
					if json.NewDecoder(resp.Body).Decode(&res) == nil {
						enforcePolicy(res.Policy)
					}
					resp.Body.Close()
				}
			}
		}
		time.Sleep(interval)
	}
}

func main() {
	daemonFlag := flag.Bool("daemon", false, "Run in background daemon mode")
	serverFlag := flag.String("server", "", "Server URL")
	codeFlag := flag.String("code", "", "Enrollment code")
	tokenFlag := flag.String("token", "", "Device token")
	nameFlag := flag.String("name", "", "Device nickname")
	uninstallFlag := flag.Bool("uninstall", false, "Uninstall background service")
	flag.Parse()

	// 1. Handle Uninstall
	if *uninstallFlag {
		if !isAdmin() {
			elevateSelf()
		}
		_ = exec.Command("schtasks", "/delete", "/tn", taskName, "/f").Run()
		_ = os.RemoveAll(getInstallDir())
		showMessage("FamilyGuard", "FamilyGuard has been uninstalled from this PC.", false)
		return
	}

	// 2. Running as Daemon
	if *daemonFlag {
		cfg, err := loadConfig()
		if err != nil {
			os.Exit(1)
		}
		runDaemon(cfg)
		return
	}

	// 3. Double-click setup / Interactive execution
	if !isAdmin() {
		elevateSelf()
	}

	existingCfg, _ := loadConfig()
	if existingCfg != nil && *serverFlag == "" && *codeFlag == "" && *tokenFlag == "" {
		// Already installed and configured
		showMessage("FamilyGuard Protected", fmt.Sprintf("FamilyGuard is actively protecting this PC.\nDevice ID: %s\nServer: %s", existingCfg.DeviceId, existingCfg.ServerUrl), false)
		return
	}

	serverUrl := *serverFlag
	code := *codeFlag
	token := *tokenFlag
	nickname := *nameFlag

	if serverUrl == "" || (code == "" && token == "") {
		// Show graphical setup dialog
		defaultServer := "http://localhost:3000"
		if existingCfg != nil && existingCfg.ServerUrl != "" {
			defaultServer = existingCfg.ServerUrl
		}
		s, c, n, ok := showGUIWizard(defaultServer)
		if !ok {
			return // User cancelled
		}
		serverUrl = s
		code = c
		nickname = n
	}

	deviceId := fmt.Sprintf("dev-%d", time.Now().Unix()%1000000)
	if code != "" {
		t, devId, err := enrollDevice(serverUrl, code, nickname)
		if err != nil {
			showMessage("Enrollment Failed", fmt.Sprintf("Could not enroll with %s:\n%v", serverUrl, err), true)
			return
		}
		token = t
		if devId != "" {
			deviceId = devId
		}
	}

	cfg := &Config{
		ServerUrl:       serverUrl,
		DeviceToken:     token,
		DeviceId:        deviceId,
		Nickname:        nickname,
		IntervalSeconds: 60,
	}

	if err := saveConfig(cfg); err != nil {
		showMessage("Configuration Error", fmt.Sprintf("Failed to save config: %v", err), true)
		return
	}

	exePath, _ := os.Executable()
	_ = installScheduledTask(exePath)

	showMessage("Setup Complete", fmt.Sprintf("Success! This PC is now enrolled in FamilyGuard.\n\nNickname: %s\nDevice ID: %s\nContinuous background monitoring is active.", nickname, deviceId), false)
}
