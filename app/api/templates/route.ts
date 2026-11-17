import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireAdmin, requireUser } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const templates = await prisma.kickoffTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (error) {
    return jsonError(error, "templates");
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { name, description, content, projectType, isDefault } = body;

    if (!name || !content) {
      return NextResponse.json(
        { error: "Name and content are required" },
        { status: 400 }
      );
    }

    // If setting as default, unset existing default
    if (isDefault) {
      await prisma.kickoffTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.kickoffTemplate.create({
      data: {
        name,
        description: description || "",
        content,
        projectType: projectType || "web-app",
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return jsonError(error, "templates");
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    // If setting as default, unset existing default
    if (data.isDefault) {
      await prisma.kickoffTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.kickoffTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json(template);
  } catch (error) {
    return jsonError(error, "templates");
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    await prisma.kickoffTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "templates");
  }
}
