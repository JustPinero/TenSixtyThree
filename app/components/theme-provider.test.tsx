// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme-provider";

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <button data-testid="probe" onClick={() => setTheme("specter")}>
      {theme}
    </button>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeProvider", () => {
  it("defaults to cyberpunk with nothing stored", () => {
    const { getByTestId } = renderProbe();
    expect(getByTestId("probe").textContent).toBe("cyberpunk");
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "cyberpunk",
    );
  });

  it("migrates a legacy stored 'dark' to cyberpunk", () => {
    localStorage.setItem("cascade-theme", "dark");
    const { getByTestId } = renderProbe();
    expect(getByTestId("probe").textContent).toBe("cyberpunk");
  });

  it("migrates a legacy stored 'light' to sunny", () => {
    localStorage.setItem("cascade-theme", "light");
    const { getByTestId } = renderProbe();
    expect(getByTestId("probe").textContent).toBe("sunny");
  });

  it("hydrates a stored pack key as-is", () => {
    localStorage.setItem("cascade-theme", "curator");
    const { getByTestId } = renderProbe();
    expect(getByTestId("probe").textContent).toBe("curator");
  });

  it("setTheme persists the new key and stamps the attribute", () => {
    const { getByTestId } = renderProbe();
    act(() => {
      getByTestId("probe").click();
    });
    expect(getByTestId("probe").textContent).toBe("specter");
    expect(localStorage.getItem("cascade-theme")).toBe("specter");
    expect(document.documentElement.getAttribute("data-theme")).toBe("specter");
  });
});
