package kvm

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"syscall"
)

type EasyTierState struct {
	EasyTierServiceState      bool `json:"easyTierServiceState"`
	EasyTierPublicServerState bool `json:"easyTierPublicServerState"`
}

type EasyTierConfig struct {
	EasyTierEnabled         bool   `json:"easyTierEnabled"`
	EasyTierPublicServer    string `json:"easyTierPublicServer"`
	EasyTierNetworkName     string `json:"easyTierNetworkName"`
	EasyTierNetworkSecret   string `json:"easyTierNetworkSecret"`
	EasyTierVirtualIPv4     string `json:"easyTierVirtualIPv4"`
	EasyTierVirtualHostname string `json:"easyTierVirtualHostname"`
	EasyTierSubnetProxyCIDR string `json:"easyTierSubnetProxyCIDR"`
}

var (
	easyTierCmd    *exec.Cmd
	easyTierMutex  sync.Mutex
	easyTierCancel context.CancelFunc
)

func startEasyTier() error {
	if len(config.EasyTierConfig.EasyTierPublicServer) == 0 || len(config.EasyTierConfig.EasyTierNetworkName) == 0 || len(config.EasyTierConfig.EasyTierNetworkSecret) == 0 {
		return fmt.Errorf("easytier configuration is invalid: public server, network name, and network secret are required")
	}

	args := []string{
		"-p", config.EasyTierConfig.EasyTierPublicServer,
		"--network-name", config.EasyTierConfig.EasyTierNetworkName,
		"--network-secret", config.EasyTierConfig.EasyTierNetworkSecret,
		"--enable-kcp-proxy",
		"--no-listener",
		"--console-log-level", "off",
	}

	if len(config.EasyTierConfig.EasyTierVirtualIPv4) > 0 {
		args = append(args, "-i", config.EasyTierConfig.EasyTierVirtualIPv4)
	} else {
		args = append(args, "-d")
	}
	if len(config.EasyTierConfig.EasyTierVirtualHostname) > 0 {
		args = append(args, "--hostname", config.EasyTierConfig.EasyTierVirtualHostname)
	}
	if len(config.EasyTierConfig.EasyTierSubnetProxyCIDR) > 0 {
		args = append(args, "-n", config.EasyTierConfig.EasyTierSubnetProxyCIDR)
	}

	easyTierMutex.Lock()
	defer easyTierMutex.Unlock()

	if easyTierCmd != nil && easyTierCmd.Process != nil && easyTierCmd.ProcessState == nil {
		return fmt.Errorf("easytier-core is already running")
	}

	ctx, cancel := context.WithCancel(context.Background())
	easyTierCancel = cancel

	easyTierCmd = exec.CommandContext(ctx, "easytier-core", args...)

	easyTierCmd.SysProcAttr = &syscall.SysProcAttr{
		Pdeathsig: syscall.SIGKILL,
	}

	if err := easyTierCmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("failed to start easytier-core: %w", err)
	}

	go func() {
		easyTierCmd.Wait()
	}()

	return nil
}

func stopEasyTier() error {
	easyTierMutex.Lock()
	defer easyTierMutex.Unlock()

	if easyTierCancel != nil {
		easyTierCancel()
		easyTierCmd = nil
		return nil
	}

	return fmt.Errorf("easytier-core is not running")
}

func restartEasyTier() error {
	stopEasyTier()

	return startEasyTier()
}

func initEasyTier() error {
	if config.EasyTierConfig.EasyTierEnabled {
		return startEasyTier()
	}

	return nil
}

func getEasyTierState() bool {
	easyTierMutex.Lock()
	defer easyTierMutex.Unlock()

	if easyTierCmd != nil && easyTierCmd.Process != nil {
		if easyTierCmd.ProcessState == nil {
			return true
		}
	}

	return false
}

func getEasyTierPublicServerState() bool {
	easyTierCliCmd := exec.Command("easytier-cli", "connector")
	easyTierCliOutput, err := easyTierCliCmd.CombinedOutput()
	if err != nil {
		return false
	}

	easyTierCliOutputStr := string(easyTierCliOutput)

	if strings.Contains(easyTierCliOutputStr, "status: Connected,") {
		return true
	}

	return false
}

func rpcGetEasyTierState() EasyTierState {
	return EasyTierState{
		EasyTierServiceState:      getEasyTierState(),
		EasyTierPublicServerState: getEasyTierPublicServerState(),
	}
}

func rpcGetEasyTierConfig() EasyTierConfig {
	return EasyTierConfig{
		EasyTierEnabled:         config.EasyTierConfig.EasyTierEnabled,
		EasyTierPublicServer:    config.EasyTierConfig.EasyTierPublicServer,
		EasyTierNetworkName:     config.EasyTierConfig.EasyTierNetworkName,
		EasyTierNetworkSecret:   config.EasyTierConfig.EasyTierNetworkSecret,
		EasyTierVirtualIPv4:     config.EasyTierConfig.EasyTierVirtualIPv4,
		EasyTierVirtualHostname: config.EasyTierConfig.EasyTierVirtualHostname,
		EasyTierSubnetProxyCIDR: config.EasyTierConfig.EasyTierSubnetProxyCIDR,
	}
}

func rpcSetEasyTierConfig(enabled bool, publicServer, networkName, networkSecret, virtualIPv4, virtualHostname, subnetProxyCIDR string) error {
	config.EasyTierConfig.EasyTierEnabled = enabled
	if config.EasyTierConfig.EasyTierEnabled {
		config.EasyTierConfig.EasyTierPublicServer = strings.TrimSpace(publicServer)
		config.EasyTierConfig.EasyTierNetworkName = strings.TrimSpace(networkName)
		config.EasyTierConfig.EasyTierNetworkSecret = strings.TrimSpace(networkSecret)
		config.EasyTierConfig.EasyTierVirtualIPv4 = strings.TrimSpace(virtualIPv4)
		config.EasyTierConfig.EasyTierVirtualHostname = strings.TrimSpace(virtualHostname)
		config.EasyTierConfig.EasyTierSubnetProxyCIDR = strings.TrimSpace(subnetProxyCIDR)
	}

	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	if enabled {
		if getEasyTierState() {
			return restartEasyTier()
		}
		return startEasyTier()
	}

	if getEasyTierState() {
		return stopEasyTier()
	}

	return nil
}
