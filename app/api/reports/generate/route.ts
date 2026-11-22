import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateSingleReport,
  generateCrossProjectReport,
  reportToMarkdown,
} from "@/lib/report-generator";
import { reportToPdf } from "@/lib/report-pdf";
import { jsonError, requireUser } from "@/lib/access";
import { scopeForViewer } from "@/lib/tenant-scope";

export async function POST(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const { type, slug, format = "markdown" } = await request.json();
    const scope = await scopeForViewer(prisma, access.viewer);

    if (type === "single") {
      if (!slug) {
        return NextResponse.json(
          { error: "slug is required for single project report" },
          { status: 400 }
        );
      }

      const report = await generateSingleReport(prisma, String(slug), scope);
      if (!report) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      if (format === "pdf") {
        const pdfBuffer = reportToPdf(report);
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="report-${slug}.pdf"`,
          },
        });
      }

      const markdown = reportToMarkdown(report);
      return NextResponse.json({ report, markdown });
    }

    if (type === "cross-project") {
      const report = await generateCrossProjectReport(prisma, scope);

      if (format === "pdf") {
        const pdfBuffer = reportToPdf(report);
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              'attachment; filename="cross-project-report.pdf"',
          },
        });
      }

      const markdown = reportToMarkdown(report);
      return NextResponse.json({ report, markdown });
    }

    return NextResponse.json(
      { error: "Invalid type. Use 'single' or 'cross-project'" },
      { status: 400 }
    );
  } catch (error) {
    return jsonError(error, "reports.generate");
  }
}
