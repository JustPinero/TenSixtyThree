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
}

const ModeContext = createContext<ShellContext>({
  mode: "local",
  isOperator: true,
});

export function DeploymentModeProvider({
  mode,
  isOperator,
  children,
}: ShellContext & { children: ReactNode }) {
  return (
    <ModeContext.Provider value={{ mode, isOperator }}>
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

/** Renders its children only on a local install. */
export function LocalOnly({ children }: { children: ReactNode }) {
  return useDeploymentMode() === "local" ? <>{children}</> : null;
}
