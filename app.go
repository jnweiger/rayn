package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Laser struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	IPAddress   string `json:"ipAddress"`
	Port        int    `json:"port"`
	Protocol    string `json:"protocol"`
	MachineType string `json:"machineType"`
	ImageData   string `json:"imageData"`
	BedWidth    int    `json:"bedWidth"`
	BedHeight   int    `json:"bedHeight"`
	PowerMode   string `json:"powerMode"` // "single" or "min_max"
}

type ColorMapping struct {
	ColorHex string `json:"colorHex"`
	Speed    int    `json:"speed"`
	Power    int    `json:"power"`
	MinPower int    `json:"minPower"`
	MaxPower int    `json:"maxPower"`
}

type Profile struct {
	ID                string         `json:"id"`
	Name              string         `json:"name"`
	MaterialThickness float64        `json:"materialThickness"`
	Mappings          []ColorMapping `json:"mappings"`
}

type App struct {
	ctx context.Context
}

type JobExecutionResult struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Logs    []string `json:"logs"`
}

type JobExecutionLog struct {
	lines []string
}

type JobOptions struct {
	EngraveLineSpacingMM float64 `json:"engraveLineSpacingMm"`
}

func normalizeJobOptions(options JobOptions) JobOptions {
	if options.EngraveLineSpacingMM <= 0 {
		options.EngraveLineSpacingMM = defaultEngraveLineSpacingMM
	}
	if options.EngraveLineSpacingMM < 0.02 {
		options.EngraveLineSpacingMM = 0.02
	}
	if options.EngraveLineSpacingMM > 2 {
		options.EngraveLineSpacingMM = 2
	}
	return options
}

func (l *JobExecutionLog) Add(format string, args ...interface{}) {
	if l == nil {
		return
	}
	l.lines = append(l.lines, fmt.Sprintf(format, args...))
}

func (l *JobExecutionLog) Lines() []string {
	if l == nil {
		return nil
	}
	return append([]string{}, l.lines...)
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) getConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	raynDir := filepath.Join(configDir, "rayn")
	if err := os.MkdirAll(raynDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(raynDir, "lasers.json"), nil
}

func (a *App) GetLasers() ([]Laser, error) {
	configPath, err := a.getConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Laser{}, nil
		}
		return nil, err
	}

	var lasers []Laser
	if err := json.Unmarshal(data, &lasers); err != nil {
		return nil, err
	}

	for i := range lasers {
		lasers[i] = normalizeLaser(lasers[i])
	}

	return lasers, nil
}

func (a *App) SaveLaser(laser Laser) error {
	lasers, err := a.GetLasers()
	if err != nil {
		return err
	}
	laser = normalizeLaser(laser)

	found := false
	for i, l := range lasers {
		if l.ID == laser.ID {
			lasers[i] = laser
			found = true
			break
		}
	}

	if !found {
		lasers = append(lasers, laser)
	}

	return a.saveLasersToFile(lasers)
}

func normalizeLaser(laser Laser) Laser {
	if laser.MachineType == "" {
		switch laser.Protocol {
		case "UDP":
			laser.MachineType = "ruida"
		default:
			laser.MachineType = "zing"
		}
	}

	if laser.Protocol == "" {
		switch laser.MachineType {
		case "ruida", "thunderlaser":
			laser.Protocol = "UDP"
		default:
			laser.Protocol = "TCP"
		}
	}

	if laser.Port == 0 {
		switch laser.MachineType {
		case "ruida", "thunderlaser":
			laser.Port = 50200
		default:
			laser.Port = 9100
		}
	}

	if laser.PowerMode == "" {
		laser.PowerMode = "single"
	}

	return laser
}

func (a *App) DeleteLaser(id string) error {
	lasers, err := a.GetLasers()
	if err != nil {
		return err
	}

	var updatedLasers []Laser
	for _, l := range lasers {
		if l.ID != id {
			updatedLasers = append(updatedLasers, l)
		}
	}

	return a.saveLasersToFile(updatedLasers)
}

func (a *App) saveLasersToFile(lasers []Laser) error {
	configPath, err := a.getConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(lasers, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

func (a *App) getProfilesConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	raynDir := filepath.Join(configDir, "rayn")
	if err := os.MkdirAll(raynDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(raynDir, "profiles.json"), nil
}

func (a *App) GetProfiles() ([]Profile, error) {
	configPath, err := a.getProfilesConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Profile{}, nil
		}
		return nil, err
	}

	var profiles []Profile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}

	return profiles, nil
}

func (a *App) SaveProfile(profile Profile) error {
	profiles, err := a.GetProfiles()
	if err != nil {
		return err
	}

	found := false
	for i, p := range profiles {
		if p.ID == profile.ID {
			profiles[i] = profile
			found = true
			break
		}
	}

	if !found {
		profiles = append(profiles, profile)
	}

	return a.saveProfilesToFile(profiles)
}

func (a *App) DeleteProfile(id string) error {
	profiles, err := a.GetProfiles()
	if err != nil {
		return err
	}

	var updatedProfiles []Profile
	for _, p := range profiles {
		if p.ID != id {
			updatedProfiles = append(updatedProfiles, p)
		}
	}

	return a.saveProfilesToFile(updatedProfiles)
}

func (a *App) saveProfilesToFile(profiles []Profile) error {
	configPath, err := a.getProfilesConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

func (a *App) TestConnection(ip string, port int, protocol string) (bool, error) {
	time.Sleep(1 * time.Second)

	if ip == "" {
		return false, fmt.Errorf("IP address is required")
	}

	return true, nil
}

type FileResponse struct {
	FileName string `json:"fileName"`
	Content  string `json:"content"`
	Error    string `json:"error"`
}

func (a *App) OpenSVGFile() FileResponse {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select SVG File",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "SVG Files (*.svg)",
				Pattern:     "*.svg",
			},
		},
	})

	if err != nil {
		return FileResponse{Error: err.Error()}
	}

	if filePath == "" {
		return FileResponse{}
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return FileResponse{Error: err.Error()}
	}

	return FileResponse{
		FileName: filepath.Base(filePath),
		Content:  string(content),
	}
}

func (a *App) ExecuteJob(machineType string, ip string, port int, jobName string, svgData string, materialProfile MaterialProfile, options JobOptions) JobExecutionResult {
	jobLog := &JobExecutionLog{}
	options = normalizeJobOptions(options)
	if jobName == "" {
		jobName = "Untitled Job"
	}

	jobLog.Add("Job: %q", jobName)
	jobLog.Add("Machine type: %s", machineType)
	jobLog.Add("Target: %s:%d", ip, port)
	jobLog.Add("Material: %s", materialProfile.Name)
	jobLog.Add("Engrave scanline spacing: %.3f mm", options.EngraveLineSpacingMM)
	jobLog.Add("SVG bytes: %d", len(svgData))

	controller, err := NewLaserController(machineType, ip, port)
	if err != nil {
		jobLog.Add("Controller error: %v", err)
		return JobExecutionResult{Success: false, Message: err.Error(), Logs: jobLog.Lines()}
	}

	jobLog.Add("Connecting...")
	if err := controller.Connect(); err != nil {
		jobLog.Add("Connection failed: %v", err)
		return JobExecutionResult{Success: false, Message: fmt.Sprintf("connection failed: %v", err), Logs: jobLog.Lines()}
	}
	jobLog.Add("Connection ready.")

	if err := controller.SendJob(jobName, svgData, materialProfile, options, jobLog); err != nil {
		jobLog.Add("Send failed: %v", err)
		if disconnectErr := controller.Disconnect(); disconnectErr != nil {
			jobLog.Add("Disconnect warning: %v", disconnectErr)
		} else {
			jobLog.Add("Connection closed.")
		}
		return JobExecutionResult{Success: false, Message: fmt.Sprintf("send failed: %v", err), Logs: jobLog.Lines()}
	}

	if err := controller.Disconnect(); err != nil {
		jobLog.Add("Disconnect warning: %v", err)
	} else {
		jobLog.Add("Connection closed.")
	}

	jobLog.Add("Transfer completed: every packet was acknowledged by the controller.")
	jobLog.Add("Note: ACKs confirm packet reception, not that the file is visible in the Ruida file list.")
	return JobExecutionResult{Success: true, Message: "transfer acknowledged", Logs: jobLog.Lines()}
}
