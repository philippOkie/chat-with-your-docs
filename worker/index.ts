import { ingestDocument } from "@/server/application/ingest-document";
import { AppError } from "@/server/domain/errors";
import type { IngestDocumentJobData } from "@/server/domain/documents";
import { DOCUMENT_INGEST_QUEUE, createJobBoss } from "@/server/jobs/queue";
import { logger } from "@/server/telemetry/logger";

const boss = createJobBoss();
let isStopping = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isStopping) return;
  isStopping = true;

  logger.info({ signal }, "worker shutdown started");
  await boss.stop({ graceful: true, timeout: 30_000 });
  logger.info({ signal }, "worker shutdown completed");
}

async function main() {
  await boss.start();
  await boss.createQueue(DOCUMENT_INGEST_QUEUE, {
    policy: "singleton",
    retryBackoff: true,
    retryDelay: 5,
    retryLimit: 3,
  });
  await boss.work<IngestDocumentJobData>(
    DOCUMENT_INGEST_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job) return;

      logger.info(
        {
          documentId: job.data.documentId,
          jobId: job.id,
          requestId: job.data.requestId,
        },
        "document ingestion job started",
      );

      try {
        await ingestDocument(job.data.documentId, job.data.requestId);
      } catch (error) {
        if (error instanceof AppError && !error.retryable) {
          logger.warn(
            {
              code: error.code,
              documentId: job.data.documentId,
              jobId: job.id,
              requestId: job.data.requestId,
            },
            "document ingestion failed without retry",
          );
          return;
        }

        throw error;
      }
    },
  );

  logger.info(
    { queue: DOCUMENT_INGEST_QUEUE },
    "document ingestion worker is ready",
  );
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exitCode = 1;
});
