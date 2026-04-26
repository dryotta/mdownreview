import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  useStore,
  type OnboardingSectionKey,
  type OnboardingStatus,
} from "@/store";
// Styles for `.settings-view`, `.settings-row`, `.settings-switch`, etc. are
// loaded globally from `src/main.tsx` (see `@/styles/settings-view.css`).

/**
 * Group B8 — full-page Settings view (no overlay/backdrop).
 *
 * Reuses the existing onboarding slice (`onboardingStatuses`,
 * `onboardingErrors`, `installCliShim`/`removeCliShim`/`setDefaultHandler`/
 * `registerFolderContext`/`unregisterFolderContext`, `formatOnboardingError`).
 * Routing into this view is owned by App.tsx (group B7) — this component is
 * presentational and only knows about the store.
 *
 * Per-row in-flight state is local: the store models *outcome* (status +
 * formatted error), not *transient action progress*. Tracking pending
 * locally keeps two parallel toggles independent — clicking the CLI switch
 * does not block the Folder switch.
 */

type SwitchAction = "install" | "remove" | "noop";

interface IntegrationRow {
  key: OnboardingSectionKey;
  label: string;
  description: string;
  status: OnboardingStatus;
  error?: string;
  /** What clicking the switch should do, given the current status. */
  action: SwitchAction;
  install: () => Promise<void>;
  /** Some rows (default-handler) have no removal action — switch is read-only when on. */
  remove?: () => Promise<void>;
}

const STATUS_BADGE: Record<OnboardingStatus, string> = {
  done: "installed",
  pending: "missing",
  unsupported: "unsupported",
  error: "error",
};

interface SwitchProps {
  label: string;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function Switch({ label, checked, pending, disabled, onToggle }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-busy={pending}
      disabled={disabled || pending}
      onClick={onToggle}
      className={`settings-switch${checked ? " settings-switch-on" : ""}`}
    >
      <span className="settings-switch-thumb" aria-hidden="true" />
    </button>
  );
}

export function SettingsView() {
  const { statuses, errors, installCliShim, removeCliShim, setDefaultHandler, registerFolderContext, unregisterFolderContext } =
    useStore(
      useShallow((s) => ({
        statuses: s.onboardingStatuses,
        errors: s.onboardingErrors,
        installCliShim: s.installCliShim,
        removeCliShim: s.removeCliShim,
        setDefaultHandler: s.setDefaultHandler,
        registerFolderContext: s.registerFolderContext,
        unregisterFolderContext: s.unregisterFolderContext,
      })),
    );

  // Refresh once on mount — keeps the view honest if the user navigated in
  // after platform state changed under us (manual Finder/Explorer edits).
  useEffect(() => {
    void useStore.getState().refreshOnboarding();
  }, []);

  // Esc closes — App.tsx (B7) is the route owner; closing here just flips
  // the store flag and lets App unmount us.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useStore.getState().closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [pending, setPending] = useState<Record<OnboardingSectionKey, boolean>>({
    cliShim: false,
    defaultHandler: false,
    folderContext: false,
  });

  const rows: IntegrationRow[] = [
    {
      key: "cliShim",
      label: "CLI shim",
      description: "Install the `mdownreview` CLI to open files from the terminal.",
      status: statuses.cliShim,
      error: errors.cliShim,
      action: statuses.cliShim === "done" ? "remove" : "install",
      install: installCliShim,
      remove: removeCliShim,
    },
    {
      key: "defaultHandler",
      label: "Default handler",
      description: "Make mdownreview the default app for `.md`/`.mdx` files.",
      status: statuses.defaultHandler,
      error: errors.defaultHandler,
      // No "remove" IPC — switch is read-only once "done".
      action: statuses.defaultHandler === "done" ? "noop" : "install",
      install: setDefaultHandler,
    },
    {
      key: "folderContext",
      label: "Folder context",
      description: "Add 'Open with mdownreview' to the Windows folder right-click menu.",
      status: statuses.folderContext,
      error: errors.folderContext,
      action: statuses.folderContext === "done" ? "remove" : "install",
      install: registerFolderContext,
      remove: unregisterFolderContext,
    },
  ];

  const handleToggle = (row: IntegrationRow) => () => {
    const fn =
      row.action === "install"
        ? row.install
        : row.action === "remove"
          ? row.remove
          : undefined;
    if (!fn) return;
    setPending((p) => ({ ...p, [row.key]: true }));
    void fn().finally(() => {
      setPending((p) => ({ ...p, [row.key]: false }));
    });
  };

  const handleClose = () => useStore.getState().closeSettings();

  return (
    <div role="region" aria-label="Settings" className="settings-view">
      <div className="settings-header">
        <h2>Settings</h2>
        <button
          type="button"
          className="settings-close"
          aria-label="Close"
          onClick={handleClose}
        >
          ×
        </button>
      </div>
      <div className="settings-body">
        {rows.map((row) => {
          const isPending = pending[row.key];
          const checked = row.status === "done";
          // Hide the switch entirely when there's no actionable direction
          // (e.g. defaultHandler "done" with no remove IPC) or when the
          // platform doesn't support the integration at all. The fallback
          // text below replaces the affordance.
          const hideSwitch =
            row.status === "unsupported" || row.action === "noop";
          const fallbackText =
            row.status === "unsupported"
              ? "Not available on this platform."
              : row.action === "noop"
                ? "Already the default — change in System Settings."
                : null;
          return (
            <div
              key={row.key}
              className="settings-row"
              data-testid={`settings-row-${row.key}`}
            >
              <div className="settings-row-main">
                <span className="settings-row-label">{row.label}</span>
                <span
                  className={`settings-row-badge settings-row-badge-${row.status}`}
                  data-testid={`settings-row-badge-${row.key}`}
                >
                  {STATUS_BADGE[row.status]}
                </span>
              </div>
              {hideSwitch ? (
                <span
                  className="settings-row-fallback"
                  data-testid={`settings-row-fallback-${row.key}`}
                >
                  {fallbackText}
                </span>
              ) : (
                <Switch
                  label={row.label}
                  checked={checked}
                  pending={isPending}
                  disabled={false}
                  onToggle={handleToggle(row)}
                />
              )}
              <div
                className="settings-row-description"
                data-testid={`settings-row-description-${row.key}`}
              >
                {row.description}
              </div>
              {row.error && (
                <div
                  className="settings-row-error"
                  role="alert"
                  data-testid={`settings-row-error-${row.key}`}
                >
                  {row.error}
                </div>
              )}
            </div>
          );
        })}
        <div className="settings-footer">
          <button
            type="button"
            className="settings-footer-link"
            onClick={() => useStore.getState().openAuthorDialog()}
          >
            Author &amp; preferences…
          </button>
        </div>
      </div>
    </div>
  );
}
