import { useCallback, useEffect, useState } from "react";

import { useSettingsStore } from "@hooks/stores";
import { JsonRpcError, JsonRpcResponse, useJsonRpc } from "@hooks/useJsonRpc";
import { useDeviceUiNavigation } from "@hooks/useAppNavigation";
import { Button, LinkButton } from "@components/Button";
import Checkbox, { CheckboxWithLabel } from "@components/Checkbox";
import { ConfirmDialog } from "@components/ConfirmDialog";
import { GridCard } from "@components/Card";
import { SettingsItem } from "@components/SettingsItem";
import { SettingsPageHeader } from "@components/SettingsPageheader";
import { NestedSettingsGroup } from "@components/NestedSettingsGroup";
import { TextAreaWithLabel } from "@components/TextArea";
import { InputFieldWithLabel } from "@components/InputField";
import { SelectMenuBasic } from "@components/SelectMenuBasic";
import { isOnDevice } from "@/main";
import notifications from "@/notifications";
import { m } from "@localizations/messages.js";
import { checkUpdateComponents, UpdateComponents } from "@/utils/jsonrpc";
import { SystemVersionInfo } from "@hooks/useVersion";

import { FeatureFlag } from "../components/FeatureFlag";

export default function SettingsAdvancedRoute() {
  const { send } = useJsonRpc();
  const { navigateTo } = useDeviceUiNavigation();

  const [sshKey, setSSHKey] = useState<string>("");
  const { setDeveloperMode } = useSettingsStore();
  const [devChannel, setDevChannel] = useState(false);
  const [defaultLogLevel, setDefaultLogLevel] = useState<string>("WARN");
  const [usbEmulationEnabled, setUsbEmulationEnabled] = useState(false);
  const [showLoopbackWarning, setShowLoopbackWarning] = useState(false);
  const [localLoopbackOnly, setLocalLoopbackOnly] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<string>("app");
  const [appVersion, setAppVersion] = useState<string>("");
  const [systemVersion, setSystemVersion] = useState<string>("");
  const [resetConfig, setResetConfig] = useState(false);
  const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
  const [versionChangeAcknowledged, setVersionChangeAcknowledged] = useState(false);
  const [customVersionUpdateLoading, setCustomVersionUpdateLoading] = useState(false);
  const settings = useSettingsStore();

  useEffect(() => {
    send("getDevModeState", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      const result = resp.result as { enabled: boolean };
      setDeveloperMode(result.enabled);
    });

    send("getSSHKeyState", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setSSHKey(resp.result as string);
    });

    send("getUsbEmulationState", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setUsbEmulationEnabled(resp.result as boolean);
    });

    send("getDevChannelState", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setDevChannel(resp.result as boolean);
    });

    send("getLocalLoopbackOnly", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setLocalLoopbackOnly(resp.result as boolean);
    });

    send("getDefaultLogLevel", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setDefaultLogLevel(resp.result as string);
    });
  }, [send, setDeveloperMode]);

  const getUsbEmulationState = useCallback(() => {
    send("getUsbEmulationState", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) return;
      setUsbEmulationEnabled(resp.result as boolean);
    });
  }, [send]);

  const handleUsbEmulationToggle = useCallback(
    (enabled: boolean) => {
      send("setUsbEmulationState", { enabled: enabled }, (resp: JsonRpcResponse) => {
        if ("error" in resp) {
          notifications.error(
            enabled
              ? m.advanced_error_usb_emulation_enable({
                  error: resp.error.data || m.unknown_error(),
                })
              : m.advanced_error_usb_emulation_disable({
                  error: resp.error.data || m.unknown_error(),
                }),
          );
          return;
        }
        setUsbEmulationEnabled(enabled);
        getUsbEmulationState();
      });
    },
    [getUsbEmulationState, send],
  );

  const handleFactoryReset = useCallback(() => {
    send("factoryReset", {}, (resp: JsonRpcResponse) => {
      if ("error" in resp) {
        notifications.error(
          m.advanced_factory_reset_error({ error: resp.error.data || m.unknown_error() }),
        );
        return;
      }
      notifications.success(m.advanced_factory_reset_success());
    });
  }, [send]);

  const handleUpdateSSHKey = useCallback(() => {
    send("setSSHKeyState", { sshKey }, (resp: JsonRpcResponse) => {
      if ("error" in resp) {
        notifications.error(
          m.advanced_error_update_ssh_key({ error: resp.error.data || m.unknown_error() }),
        );
        return;
      }
      notifications.success(m.advanced_success_update_ssh_key());
    });
  }, [send, sshKey]);

  const handleDevModeChange = useCallback(
    (developerMode: boolean) => {
      send("setDevModeState", { enabled: developerMode }, (resp: JsonRpcResponse) => {
        if ("error" in resp) {
          notifications.error(
            m.advanced_error_set_dev_mode({ error: resp.error.data || m.unknown_error() }),
          );
          return;
        }
        setDeveloperMode(developerMode);
      });
    },
    [send, setDeveloperMode],
  );

  const handleDevChannelChange = useCallback(
    (enabled: boolean) => {
      send("setDevChannelState", { enabled }, (resp: JsonRpcResponse) => {
        if ("error" in resp) {
          notifications.error(
            m.advanced_error_set_dev_channel({ error: resp.error.data || m.unknown_error() }),
          );
          return;
        }
        setDevChannel(enabled);
      });
    },
    [send, setDevChannel],
  );

  const applyLoopbackOnlyMode = useCallback(
    (enabled: boolean) => {
      send("setLocalLoopbackOnly", { enabled }, (resp: JsonRpcResponse) => {
        if ("error" in resp) {
          notifications.error(
            enabled
              ? m.advanced_error_loopback_enable({ error: resp.error.data || m.unknown_error() })
              : m.advanced_error_loopback_disable({ error: resp.error.data || m.unknown_error() }),
          );
          return;
        }
        setLocalLoopbackOnly(enabled);
        if (enabled) {
          notifications.success(m.advanced_success_loopback_enabled());
        } else {
          notifications.success(m.advanced_success_loopback_disabled());
        }
      });
    },
    [send, setLocalLoopbackOnly],
  );

  const handleLoopbackOnlyModeChange = useCallback(
    (enabled: boolean) => {
      // If trying to enable loopback-only mode, show warning first
      if (enabled) {
        setShowLoopbackWarning(true);
      } else {
        // If disabling, just proceed
        applyLoopbackOnlyMode(false);
      }
    },
    [applyLoopbackOnlyMode, setShowLoopbackWarning],
  );

  const confirmLoopbackModeEnable = useCallback(() => {
    applyLoopbackOnlyMode(true);
    setShowLoopbackWarning(false);
  }, [applyLoopbackOnlyMode, setShowLoopbackWarning]);

  const handleVersionUpdateError = useCallback((error?: JsonRpcError | string) => {
    notifications.error(
      m.advanced_error_version_update({
        error:
          typeof error === "string" ? error : (error?.data ?? error?.message ?? m.unknown_error()),
      }),
      { duration: 1000 * 15 }, // 15 seconds
    );
    setCustomVersionUpdateLoading(false);
  }, []);

  const handleCustomVersionUpdate = useCallback(async () => {
    const components: UpdateComponents = {};
    if (["app", "both"].includes(updateTarget) && appVersion) components.app = appVersion;
    if (["system", "both"].includes(updateTarget) && systemVersion)
      components.system = systemVersion;
    let versionInfo: SystemVersionInfo | undefined;

    try {
      // we do not need to set it to false if check succeeds,
      // because it will be redirected to the update page later
      setCustomVersionUpdateLoading(true);
      versionInfo = await checkUpdateComponents({ components }, devChannel);
    } catch (error: unknown) {
      const jsonRpcError = error as JsonRpcError;
      handleVersionUpdateError(jsonRpcError);
      return;
    }

    let hasUpdate = false;

    const pageParams = new URLSearchParams();
    if (components.app && versionInfo?.remote?.appVersion && versionInfo?.appUpdateAvailable) {
      hasUpdate = true;
      pageParams.set("custom_app_version", versionInfo.remote?.appVersion);
    }
    if (
      components.system &&
      versionInfo?.remote?.systemVersion &&
      versionInfo?.systemUpdateAvailable
    ) {
      hasUpdate = true;
      pageParams.set("custom_system_version", versionInfo.remote?.systemVersion);
    }
    pageParams.set("reset_config", resetConfig.toString());

    if (!hasUpdate) {
      handleVersionUpdateError("No update available");
      return;
    }

    // Navigate to update page
    navigateTo(`/settings/general/update?${pageParams.toString()}`);
  }, [
    appVersion,
    devChannel,
    handleVersionUpdateError,
    navigateTo,
    resetConfig,
    systemVersion,
    updateTarget,
  ]);

  return (
    <div className="space-y-4">
      <SettingsPageHeader title={m.advanced_title()} description={m.advanced_description()} />

      <div className="space-y-4">
        <SettingsItem
          title={m.advanced_troubleshooting_mode_title()}
          description={m.advanced_troubleshooting_mode_description()}
        >
          <Checkbox
            defaultChecked={settings.debugMode}
            onChange={e => {
              settings.setDebugMode(e.target.checked);
            }}
          />
        </SettingsItem>

        {settings.debugMode && (
          <NestedSettingsGroup>
            <SettingsItem
              title={m.advanced_troubleshooting_log_level_title()}
              description={m.advanced_troubleshooting_log_level_description()}
            >
              <SelectMenuBasic
                size="SM"
                value={defaultLogLevel}
                options={[
                  { label: m.advanced_log_level_error(), value: "ERROR" },
                  { label: m.advanced_log_level_warning(), value: "WARN" },
                  { label: m.advanced_log_level_info(), value: "INFO" },
                  { label: m.advanced_log_level_debug(), value: "DEBUG" },
                  { label: m.advanced_log_level_trace(), value: "TRACE" },
                ]}
                onChange={e => {
                  const level = e.target.value;
                  const previousLevel = defaultLogLevel;
                  setDefaultLogLevel(level);
                  send("setDefaultLogLevel", { level }, (resp: JsonRpcResponse) => {
                    if ("error" in resp) {
                      setDefaultLogLevel(previousLevel);
                      notifications.error(
                        m.advanced_error_set_log_level({ error: resp.error.data || m.unknown_error() }),
                      );
                      return;
                    }
                  });
                }}
              />
            </SettingsItem>

            <SettingsItem
              title={m.advanced_usb_emulation_title()}
              description={m.advanced_usb_emulation_description()}
            >
              <Button
                size="SM"
                theme="light"
                text={
                  usbEmulationEnabled
                    ? m.advanced_disable_usb_emulation()
                    : m.advanced_enable_usb_emulation()
                }
                onClick={() => handleUsbEmulationToggle(!usbEmulationEnabled)}
              />
            </SettingsItem>

            <SettingsItem
              title={m.advanced_factory_reset_title()}
              description={m.advanced_factory_reset_description()}
            >
              <Button
                size="SM"
                theme="danger"
                text={m.advanced_factory_reset_button()}
                onClick={() => setShowFactoryResetConfirm(true)}
              />
            </SettingsItem>

            <SettingsItem
              title={m.advanced_download_diagnostics_title()}
              description={m.advanced_download_diagnostics_description()}
            >
              <LinkButton
                to="/diagnostics"
                reloadDocument
                download
                size="SM"
                theme="light"
                text={m.advanced_download_diagnostics_button()}
              />
            </SettingsItem>
          </NestedSettingsGroup>
        )}
      </div>

      <ConfirmDialog
        open={showFactoryResetConfirm}
        onClose={() => setShowFactoryResetConfirm(false)}
        title={m.advanced_factory_reset_dialog_title()}
        description={m.advanced_factory_reset_dialog_description()}
        variant="danger"
        confirmText={m.advanced_factory_reset_confirm()}
        onConfirm={() => {
          setShowFactoryResetConfirm(false);
          handleFactoryReset();
        }}
      />

      <ConfirmDialog
        open={showLoopbackWarning}
        onClose={() => {
          setShowLoopbackWarning(false);
        }}
        title={m.advanced_loopback_warning_title()}
        description={
          <>
            <p>{m.advanced_loopback_warning_description()}</p>
            <p>{m.advanced_loopback_warning_before()}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
              <li>{m.advanced_loopback_warning_ssh()}</li>
              <li>{m.advanced_loopback_warning_cloud()}</li>
            </ul>
          </>
        }
        variant="warning"
        confirmText={m.advanced_loopback_warning_confirm()}
        onConfirm={confirmLoopbackModeEnable}
      />
    </div>
  );
}
