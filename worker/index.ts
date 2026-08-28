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

  logger.info(
    { queue: DOCUMENT_INGEST_QUEUE },
    "ingestion worker foundation is ready",
  );
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exitCode = 1;
});
