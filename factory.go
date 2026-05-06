package main

import (
	"fmt"
	"strings"
)

func NewLaserController(machineType string, ip string, port int) (LaserController, error) {
	switch strings.ToLower(strings.TrimSpace(machineType)) {

	case "zing", "epilog":
		if port == 0 {
			port = 9100
		}
		return &ZingController{
			IPAddress: ip,
			Port:      port,
		}, nil

	case "ruida", "thunderlaser":
		if port == 0 {
			port = 50200
		}
		return &RuidaController{
			IPAddress: ip,
			Port:      port,
		}, nil

	default:
		return nil, fmt.Errorf(
			"laser factory: unsupported machine type %q – valid options are: zing, epilog, ruida, thunderlaser",
			machineType,
		)
	}
}
