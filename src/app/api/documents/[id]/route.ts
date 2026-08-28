import { z } from "zod";

import { getDocument, toPublicDocument } from "@/server/application/documents";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idSchema = z.uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);

  try {
    const result = idSchema.safeParse((await params).id);
    if (!result.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "The document ID is invalid.",
        statusCode: 400,
      });
    }

    const document = await getDocument(result.data);
    return Response.json(
      { document: toPublicDocument(document), requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
