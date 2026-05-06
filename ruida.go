package main

import (
	"fmt"
	"log"
	"net"
	"time"
)

type RuidaController struct {
	IPAddress string
	Port      int

	conn *net.UDPConn
}

func (r *RuidaController) Connect() error {
	address := fmt.Sprintf("%s:%d", r.IPAddress, r.Port)
	log.Printf("[Ruida] Opening UDP socket to %s ...", address)

	udpAddr, err := net.ResolveUDPAddr("udp", address)
	if err != nil {
		return fmt.Errorf("ruida: cannot resolve UDP address %s: %w", address, err)
	}

	conn, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		return fmt.Errorf("ruida: UDP dial to %s failed: %w", address, err)
	}

	conn.SetDeadline(time.Now().Add(30 * time.Second))

	r.conn = conn
	log.Printf("[Ruida] UDP socket ready → %s", address)
	return nil
}

func (r *RuidaController) Disconnect() error {
	if r.conn == nil {
		return nil
	}
	log.Printf("[Ruida] Closing UDP socket to %s:%d", r.IPAddress, r.Port)
	err := r.conn.Close()
	r.conn = nil
	return err
}

func (r *RuidaController) SendJob(svgData string, profile MaterialProfile) error {
	if r.conn == nil {
		return fmt.Errorf("ruida: not connected – call Connect() first")
	}

	log.Printf("[Ruida] Preparing job for material '%s'", profile.Name)
	log.Printf("[Ruida]   Cut    → Speed: %d  Power: %d%%", profile.Cut.Speed, profile.Cut.Power)
	log.Printf("[Ruida]   Engrave→ Speed: %d  Power: %d%%", profile.Engrave.Speed, profile.Engrave.Power)
	log.Printf("[Ruida]   Mark   → Speed: %d  Power: %d%%", profile.Mark.Speed, profile.Mark.Power)

	// TODO: replace this stub with Ruida packet generation.
	log.Printf("[Ruida] Transmitting job (%d bytes of SVG) via binary Ruida protocol over UDP…", len(svgData))

	return nil
}
