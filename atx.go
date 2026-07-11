package kvm

import (
	"time"

	"github.com/warthog618/go-gpiocdev"
)

const gpiochip = "gpiochip1"

var (
	atxPowerLedLine    *gpiocdev.Line
	atxHddLedLine      *gpiocdev.Line
	atxPowerButtonLine *gpiocdev.Line
	atxResetButtonLine *gpiocdev.Line
	atxPowerLedStatus  bool
	atxHddLedStatus    bool
)

func initAtx() {
	var err error
	ensureConfigLoaded()
	scopedLogger := serialLogger.With().Str("service", "atx_control").Logger()
	atxPowerLedLine, err = gpiocdev.RequestLine(gpiochip, 0, gpiocdev.AsInput, gpiocdev.LineBiasPullUp, gpiocdev.AsActiveLow, gpiocdev.WithBothEdges, gpiocdev.WithEventHandler(powerLedHandler))
	if err != nil {
		scopedLogger.Fatal().Err(err).Msg("Error requesting atx_power_led")
	}
	atxHddLedLine, err = gpiocdev.RequestLine(gpiochip, 2, gpiocdev.AsInput, gpiocdev.LineBiasPullUp, gpiocdev.AsActiveLow, gpiocdev.WithBothEdges, gpiocdev.WithEventHandler(hddLedHandler))
	if err != nil {
		scopedLogger.Fatal().Err(err).Msg("Error requesting atx_hdd_led")
	}
	atxPowerButtonLine, err = gpiocdev.RequestLine(gpiochip, 8, gpiocdev.AsOutput(0))
	if err != nil {
		scopedLogger.Fatal().Err(err).Msg("Error requesting atx_power_button")
	}
	atxResetButtonLine, err = gpiocdev.RequestLine(gpiochip, 1, gpiocdev.AsOutput(0))
	if err != nil {
		scopedLogger.Fatal().Err(err).Msg("Error requesting atx_reset_button")
	}
	atxPowerLedValue, err := atxPowerLedLine.Value()
	if atxPowerLedValue == 1 {
		atxPowerLedStatus = true
	}
	atxHddLedValue, err := atxHddLedLine.Value()
	if atxHddLedValue == 1 {
		atxHddLedStatus = true
	}
}

func powerLedHandler(evt gpiocdev.LineEvent) {
	switch evt.Type {
	case gpiocdev.LineEventRisingEdge:
		atxPowerLedStatus = true
	case gpiocdev.LineEventFallingEdge:
		atxPowerLedStatus = false
	}
	if currentSession != nil {
		writeJSONRPCEvent("atxState", ATXState{
			Power: atxPowerLedStatus,
			HDD:   atxHddLedStatus,
		}, currentSession)
	}
}

func hddLedHandler(evt gpiocdev.LineEvent) {
	switch evt.Type {
	case gpiocdev.LineEventRisingEdge:
		atxHddLedStatus = true
	case gpiocdev.LineEventFallingEdge:
		atxHddLedStatus = false
	}
	if currentSession != nil {
		writeJSONRPCEvent("atxState", ATXState{
			Power: atxPowerLedStatus,
			HDD:   atxHddLedStatus,
		}, currentSession)
	}
}

func pressATXPowerButton(duration time.Duration) error {
	var err error
	err = atxPowerButtonLine.SetValue(1)
	if err != nil {
		return err
	}
	time.Sleep(duration)
	err = atxPowerButtonLine.SetValue(0)
	if err != nil {
		return err
	}
	return nil
}

func pressATXResetButton(duration time.Duration) error {
	var err error
	err = atxResetButtonLine.SetValue(1)
	if err != nil {
		return err
	}
	time.Sleep(duration)
	err = atxResetButtonLine.SetValue(0)
	if err != nil {
		return err
	}
	return nil
}
