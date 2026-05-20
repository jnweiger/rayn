package main

import (
	"fmt"
	"log"
	"net"
	"time"
)

type ZingController struct {
	IPAddress string
	Port      int

	conn net.Conn
}

func (z *ZingController) Connect() error {
	address := fmt.Sprintf("%s:%d", z.IPAddress, z.Port)
	log.Printf("[Epilog Zing] Dialing TCP %s ...", address)

	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	if err != nil {
		return fmt.Errorf("epilog zing: TCP connect to %s failed: %w", address, err)
	}

	z.conn = conn
	log.Printf("[Epilog Zing] Connected to %s", address)
	return nil
}

func (z *ZingController) Disconnect() error {
	if z.conn == nil {
		return nil
	}
	log.Printf("[Epilog Zing] Closing TCP connection to %s:%d", z.IPAddress, z.Port)
	err := z.conn.Close()
	z.conn = nil
	return err
}

func (z *ZingController) SendJob(jobName string, svgData string, profile MaterialProfile, options JobOptions, jobLog *JobExecutionLog) error {
	if z.conn == nil {
		return fmt.Errorf("epilog zing: not connected – call Connect() first")
	}

	options = normalizeJobOptions(options)
	jobLog.Add("Epilog Zing sender selected.")
	jobLog.Add("Preparing %q with %d SVG bytes.", jobName, len(svgData))
	jobLog.Add("Engrave scanline spacing %.3f mm is ignored by the Epilog stub.", options.EngraveLineSpacingMM)
	jobLog.Add("Cut: speed %d, power %d%%.", profile.Cut.Speed, profile.Cut.Power)
	jobLog.Add("Engrave: speed %d, power %d%%.", profile.Engrave.Speed, profile.Engrave.Power)
	jobLog.Add("Mark: speed %d, power %d%%.", profile.Mark.Speed, profile.Mark.Power)
	jobLog.Add("Epilog output is still a stub; no real PJL/HPGL data was transmitted.")

	log.Printf("[Epilog Zing] Preparing job %q for material '%s'", jobName, profile.Name)
	log.Printf("[Epilog Zing]   Cut    → Speed: %d  Power: %d%%", profile.Cut.Speed, profile.Cut.Power)
	log.Printf("[Epilog Zing]   Engrave→ Speed: %d  Power: %d%%", profile.Engrave.Speed, profile.Engrave.Power)
	log.Printf("[Epilog Zing]   Mark   → Speed: %d  Power: %d%%", profile.Mark.Speed, profile.Mark.Power)

	// TODO: replace this stub with PJL/HPGL generation.
	log.Printf("[Epilog Zing] Transmitting job (%d bytes of SVG) via PJL/HPGL over TCP…", len(svgData))

	return nil
}
