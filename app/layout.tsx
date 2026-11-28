import { themeBootScript } from "@/lib/theme-boot";
import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "./components/sidebar";
import { SetPasswordPrompt } from "./components/set-password-prompt";
import { DemoBanner } from "./components/demo-banner";
import { DemoTour } from "./components/demo-tour";
import { ThemeProvider } from "./components/theme-provider";
import { DeploymentModeProvider } from "./components/deployment-mode";
import { headers } from "next/headers";
import { deploymentMode } from "@/lib/deployment-mode";
import { viewerFromHeaders } from "@/lib/access";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TenSixtyThree",
  description:
    "A nerve center for orchestrating multi-project Claude Code workflows.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 68.1 — mode-aware shell. Signed-out visitors on the hosted app (the
  // landing and sign-in pages) get no app chrome at all.
  const mode = deploymentMode();
  const viewer = await viewerFromHeaders(await headers());
  const isOperator =
    viewer?.kind === "local" || (viewer?.kind === "user" && viewer.isAdmin && !viewer.isDemo);
  const chrome = viewer !== null;
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Phase 61.5 — stamp the stored pack BEFORE first paint. Without
            this the page renders as dark cyberpunk and then swaps, on
            every navigation, for anyone not using the default pack. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript() }}
        />
      </head>
      <body className="h-full flex scanlines">
        <ThemeProvider>
          <DeploymentModeProvider
            mode={mode}
            isOperator={isOperator}
            isDemo={viewer?.kind === "user" && viewer.isDemo}
          >
          {chrome ? <Sidebar /> : null}
          {/* 71.3 — min-w-0: a flex child defaults to min-width:auto, which
              let wide page content widen the whole document (sideways
              scroll at 390px on six pages). h-full + min-h-0 keep <main>
              the one scroll container. */}
          <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col">
            {/* Reserves the fixed menu button's space below lg, so banners
                and page headers never sit underneath it. */}
            {chrome ? <div aria-hidden className="h-14 shrink-0 lg:hidden" /> : null}
            {chrome ? (
              <>
                <DemoBanner />
                <DemoTour />
                <SetPasswordPrompt />
              </>
            ) : null}
            <main className="flex-1 min-h-0 min-w-0 overflow-auto p-4 sm:p-6">
              {children}
            </main>
          </div>
          </DeploymentModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
