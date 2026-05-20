package main

type LaserController interface {
	Connect() error
	Disconnect() error
	SendJob(jobName string, svgData string, profile MaterialProfile, options JobOptions, log *JobExecutionLog) error
}
