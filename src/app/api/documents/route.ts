import { env } from "@/server/config/env";
import {
  createDocumentFromFile,
  listDocuments,
  toPublicDocument,
} from "@/server/application/documents";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const documentList = await listDocuments();
    return Response.json(
      { documents: documentList.map(toPublicDocument), requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > env.MAX_UPLOAD_BYTES + 1024 * 1024) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: `The upload exceeds the ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
        statusCode: 413,
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Choose a PDF, TXT, or Markdown file to upload.",
        statusCode: 400,
      });
    }

    const document = await createDocumentFromFile(file, requestId);
    return Response.json(
      { document: toPublicDocument(document), requestId },
      { headers: { "x-request-id": requestId }, status: 202 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
