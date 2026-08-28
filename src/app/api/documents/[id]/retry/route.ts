import { z } from "zod";

import {
  retryDocument,
  toPublicDocument,
} from "@/server/application/documents";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const runtime = "nodejs";

const idSchema = z.uuid();

export async function POST(
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

    const document = await retryDocument(result.data, requestId);
    return Response.json(
      { document: toPublicDocument(document), requestId },
      { headers: { "x-request-id": requestId }, status: 202 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
