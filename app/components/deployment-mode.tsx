"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DeploymentMode } from "@/lib/deployment-mode";

/**
 * Phase 68.1 — the deployment mode and whether the viewer is an
 * operator (local, or a hosted admin), set once by the server layout.
 * Defaults to the local operator so components rendered outside the
 * provider (unit tests) keep their existing behavior.
 */
interface ShellContext {
  mode: DeploymentMode;
  isOperator: boolean;
  /** 75 — a demo-sandbox visitor (server-resolved from User.isDemo). */
  isDemo?: boolean;
}

const ModeContext = createContext<ShellContext>({
  mode: "local",
  isOperator: true,
  isDemo: false,
});

export function DeploymentModeProvider({
  mode,
  isOperator,
  isDemo = false,
  children,
}: ShellContext & { children: ReactNode }) {
  return (
    <ModeContext.Provider value={{ mode, isOperator, isDemo }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useDeploymentMode(): DeploymentMode {
  return useContext(ModeContext).mode;
}

export function useIsOperator(): boolean {
  return useContext(ModeContext).isOperator;
}

export function useIsDemo(): boolean {
  return useContext(ModeContext).isDemo === true;
}

/** 75 — renders its children for everyone except demo-sandbox visitors. */
export function NotDemo({ children }: { children: ReactNode }) {
  return useIsDemo() ? null : <>{children}</>;
}

/** Renders its children only on a local install. */
export function LocalOnly({ children }: { children: ReactNode }) {
  return useDeploymentMode() === "local" ? <>{children}</> : null;
}
