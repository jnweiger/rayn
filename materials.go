package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type OperationSettings struct {
	Speed int `json:"speed"`
	Power int `json:"power"`
}

type MaterialThicknessSettings struct {
	ID        string            `json:"id"`
	Thickness float64           `json:"thickness"`
	Cut       OperationSettings `json:"cut"`
	Engrave   OperationSettings `json:"engrave"`
	Mark      OperationSettings `json:"mark"`
}

type MaterialProfile struct {
	ID          string                      `json:"id"`
	LaserID     string                      `json:"laserId"`
	Name        string                      `json:"name"`
	Thicknesses []MaterialThicknessSettings `json:"thicknesses"`
	Cut         OperationSettings           `json:"cut"`
	Engrave     OperationSettings           `json:"engrave"`
	Mark        OperationSettings           `json:"mark"`
}

func (a *App) getMaterialsConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	raynDir := filepath.Join(configDir, "rayn")
	if err := os.MkdirAll(raynDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(raynDir, "materials.json"), nil
}

func (a *App) GetMaterials() ([]MaterialProfile, error) {
	configPath, err := a.getMaterialsConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []MaterialProfile{}, nil
		}
		return nil, err
	}

	var materials []MaterialProfile
	if err := json.Unmarshal(data, &materials); err != nil {
		return nil, err
	}

	for i := range materials {
		materials[i] = normalizeMaterialProfile(materials[i])
	}

	return materials, nil
}

func (a *App) SaveMaterial(material MaterialProfile) error {
	materials, err := a.GetMaterials()
	if err != nil {
		return err
	}
	material = normalizeMaterialProfile(material)

	found := false
	for i, m := range materials {
		if m.ID == material.ID {
			materials[i] = material
			found = true
			break
		}
	}

	if !found {
		materials = append(materials, material)
	}

	return a.saveMaterialsToFile(materials)
}

func normalizeMaterialProfile(material MaterialProfile) MaterialProfile {
	if len(material.Thicknesses) == 0 {
		material.Thicknesses = []MaterialThicknessSettings{
			{
				ID:        "legacy-3mm",
				Thickness: 3,
				Cut:       material.Cut,
				Engrave:   material.Engrave,
				Mark:      material.Mark,
			},
		}
	}

	for i := range material.Thicknesses {
		if material.Thicknesses[i].ID == "" {
			material.Thicknesses[i].ID = "thickness"
		}
	}

	material.Cut = material.Thicknesses[0].Cut
	material.Engrave = material.Thicknesses[0].Engrave
	material.Mark = material.Thicknesses[0].Mark

	return material
}

func (a *App) DeleteMaterial(id string) error {
	materials, err := a.GetMaterials()
	if err != nil {
		return err
	}

	var updatedMaterials []MaterialProfile
	for _, m := range materials {
		if m.ID != id {
			updatedMaterials = append(updatedMaterials, m)
		}
	}

	return a.saveMaterialsToFile(updatedMaterials)
}

func (a *App) saveMaterialsToFile(materials []MaterialProfile) error {
	configPath, err := a.getMaterialsConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(materials, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}
