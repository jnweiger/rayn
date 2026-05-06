package main

type LaserController interface {
	Connect() error
	Disconnect() error
	SendJob(svgData string, profile MaterialProfile) error
}
