package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode"
)

var fontFileExtensions = map[string]bool{
	".otf":  true,
	".ttf":  true,
	".woff": true,
}

func (a *App) LoadFontDataForFamily(fontFamily string) (string, error) {
	fontPath := findFontFile(fontFamily)
	if fontPath == "" {
		return "", nil
	}

	data, err := os.ReadFile(fontPath)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(data), nil
}

func findFontFile(fontFamily string) string {
	family := normalizeFontName(fontFamily)
	if family == "" {
		return ""
	}

	for _, dir := range systemFontDirs() {
		if path := findFontFileInDir(dir, family); path != "" {
			return path
		}
	}
	return ""
}

func systemFontDirs() []string {
	home, _ := os.UserHomeDir()
	dirs := []string{}
	if home != "" {
		dirs = append(dirs, filepath.Join(home, "Library", "Fonts"))
	}

	switch runtime.GOOS {
	case "darwin":
		dirs = append(dirs, "/Library/Fonts", "/System/Library/Fonts", "/System/Library/Fonts/Supplemental")
	case "windows":
		if windir := os.Getenv("WINDIR"); windir != "" {
			dirs = append(dirs, filepath.Join(windir, "Fonts"))
		}
	default:
		if home != "" {
			dirs = append(dirs, filepath.Join(home, ".local", "share", "fonts"))
			dirs = append(dirs, filepath.Join(home, ".fonts"))
		}
		dirs = append(dirs, "/usr/local/share/fonts", "/usr/share/fonts")
	}

	return dirs
}

func findFontFileInDir(dir string, family string) string {
	var bestPath string
	bestScore := 0

	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if !fontFileExtensions[strings.ToLower(filepath.Ext(path))] {
			return nil
		}

		name := normalizeFontName(strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)))
		score := fontMatchScore(family, name)
		if score > bestScore {
			bestScore = score
			bestPath = path
		}
		return nil
	})

	return bestPath
}

func fontMatchScore(family string, fileName string) int {
	if family == "" || fileName == "" {
		return 0
	}
	if fileName == family {
		return 100
	}
	if strings.HasPrefix(fileName, family) {
		return 80
	}
	if strings.Contains(fileName, family) {
		return 60
	}

	parts := strings.Fields(family)
	matches := 0
	for _, part := range parts {
		if strings.Contains(fileName, part) {
			matches++
		}
	}
	if len(parts) > 0 && matches == len(parts) {
		return 40 + matches
	}
	return 0
}

func normalizeFontName(value string) string {
	value = strings.TrimSpace(strings.Trim(value, `"'`))
	value = strings.ToLower(value)

	var builder strings.Builder
	lastWasSpace := false
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			builder.WriteRune(r)
			lastWasSpace = false
			continue
		}
		if !lastWasSpace {
			builder.WriteByte(' ')
			lastWasSpace = true
		}
	}
	return strings.Join(strings.Fields(builder.String()), " ")
}
