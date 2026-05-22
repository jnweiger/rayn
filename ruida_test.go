package main

import (
	"math"
	"testing"
)

func TestRuidaEngraveCombinesNearbyFilledObjectsPerScanline(t *testing.T) {
	svg := `<svg width="40mm" height="10mm" viewBox="0 0 40 10" xmlns="http://www.w3.org/2000/svg">
		<rect x="0" y="0" width="10" height="5" fill="black"/>
		<rect x="20" y="0" width="10" height="5" fill="black"/>
	</svg>`

	segments, err := parseRuidaSVG(svg, JobOptions{EngraveLineSpacingMM: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(segments) < 2 {
		t.Fatalf("expected scanline segments, got %d", len(segments))
	}

	if math.Abs(segments[0].from.y-segments[1].from.y) > 0.001 {
		t.Fatalf("expected first two intervals on the same scanline, got y %.3f and %.3f", segments[0].from.y, segments[1].from.y)
	}
	if segments[0].from.x > segments[1].from.x {
		t.Fatalf("expected first scanline to process intervals left-to-right, got %.3f then %.3f", segments[0].from.x, segments[1].from.x)
	}
}

func TestRuidaEngraveFilledPathKeepsInnerContour(t *testing.T) {
	svg := `<svg width="20mm" height="20mm" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
		<path fill="black" d="M0 0 H10 V10 H0 Z M3 3 H7 V7 H3 Z"/>
	</svg>`

	segments, err := parseRuidaSVG(svg, JobOptions{EngraveLineSpacingMM: 1})
	if err != nil {
		t.Fatal(err)
	}

	segmentsByY := map[int]int{}
	for _, segment := range segments {
		segmentsByY[int(math.Round(segment.from.y*1000))]++
	}

	foundSplitScanline := false
	for _, count := range segmentsByY {
		if count >= 2 {
			foundSplitScanline = true
			break
		}
	}
	if !foundSplitScanline {
		t.Fatalf("expected at least one scanline split by the inner contour, got %d segment(s)", len(segments))
	}
}

func TestRuidaMarkUsesLowerMinPower(t *testing.T) {
	layer := ruidaLayer{
		op:       "mark",
		settings: OperationSettings{Speed: 100, Power: 20},
	}

	minPower, maxPower := layerPowerRange(layer)
	if maxPower != 20 {
		t.Fatalf("expected max power 20, got %d", maxPower)
	}
	if minPower >= maxPower {
		t.Fatalf("expected mark min power below max power, got min %d max %d", minPower, maxPower)
	}
}
