import { env } from "@/server/config/env";
import type { IngestDocumentJobData } from "@/server/domain/documents";

import { createJobBoss, DOCUMENT_INGEST_QUEUE } from "./queue";

type JobClientState = {
  promise?: ReturnType<typeof startJobClient>;
};

const globalForJobs = globalThis as unknown as {
  documentIngestionJobs?: JobClientState;
};

const jobState =
  globalForJobs.documentIngestionJobs ??
  (globalForJobs.documentIngestionJobs = {});

async function startJobClient() {
  const boss = createJobBoss();
  await boss.start();
  await boss.createQueue(DOCUMENT_INGEST_QUEUE, {
    policy: "singleton",
    retryBackoff: true,
    retryDelay: 5,
    retryLimit: 3,
  });
  return boss;
}

export async function enqueueDocumentIngestion(
  data: IngestDocumentJobData,
): Promise<string> {
  jobState.promise ??= startJobClient().catch((error: unknown) => {
    jobState.promise = undefined;
    throw error;
  });
  const boss = await jobState.promise;
  const jobId = await boss.send(DOCUMENT_INGEST_QUEUE, data, {
    singletonKey: data.documentId,
  });

  if (!jobId) throw new Error("pg-boss did not create an ingestion job");
  return jobId;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}
