"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type DocumentStatus = "failed" | "processing" | "queued" | "ready";

type DocumentRecord = {
  chunkCount: number | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  id: string;
  mimeType: string;
  name: string;
  pageCount: number | null;
  sizeBytes: number;
  status: DocumentStatus;
  tokenCount: number | null;
};

type DocumentListResponse = {
  documents: DocumentRecord[];
};

type ErrorResponse = {
  error?: { message?: string };
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  failed: "Failed",
  processing: "Processing",
  queued: "Queued",
  ready: "Ready",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileKind(document: DocumentRecord): string {
  if (document.mimeType === "application/pdf") return "PDF";
  if (/\.md(?:own)?$/i.test(document.name)) return "MD";
  return "TXT";
}

async function responseError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
  return payload.error?.message ?? "Something went wrong. Please try again.";
}

export function DocumentLibrary() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = (await response.json()) as DocumentListResponse;
      setDocuments(payload.documents);
      setError(undefined);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The document library could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initial = window.setTimeout(() => {
      void loadDocuments().finally(() => {
        if (isMounted) setIsLoading(false);
      });
    }, 0);
    const interval = window.setInterval(() => void loadDocuments(), 2_500);
    return () => {
      isMounted = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadDocuments]);

  const uploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(undefined);
    setNotice(undefined);

    let uploaded = 0;
    const failures: string[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.set("file", file);

      try {
        const response = await fetch("/api/documents", {
          body: formData,
          method: "POST",
        });
        if (!response.ok) throw new Error(await responseError(response));
        uploaded += 1;
      } catch (uploadError) {
        failures.push(
          `${file.name}: ${uploadError instanceof Error ? uploadError.message : "Upload failed."}`,
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (uploaded > 0) {
      setNotice(
        `${uploaded} document${uploaded === 1 ? "" : "s"} uploaded and queued.`,
      );
    }
    if (failures.length > 0) setError(failures.join(" "));
    setIsUploading(false);
    await loadDocuments();
  };

  const retryDocument = async (documentId: string) => {
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(`/api/documents/${documentId}/retry`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice("The document was queued again.");
      await loadDocuments();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "The document could not be retried.",
      );
    }
  };

  const readyCount = documents.filter(
    (document) => document.status === "ready",
  ).length;
  const activeCount = documents.filter(
    (document) =>
      document.status === "queued" || document.status === "processing",
  ).length;

  return (
    <>
      <section className="library-hero">
        <div>
          <p className="kicker">Reusable knowledge base</p>
          <h1>Document library</h1>
          <p>
            Add source material once, follow every processing step, and reuse
            ready documents across future conversations.
          </p>
        </div>
        <div className="library-stats" aria-label="Document library summary">
          <span>
            <strong>{documents.length}</strong> total
          </span>
          <span>
            <strong>{readyCount}</strong> ready
          </span>
          <span>
            <strong>{activeCount}</strong> processing
          </span>
        </div>
      </section>

      <section className="upload-panel" aria-labelledby="upload-heading">
        <div className="upload-icon" aria-hidden="true">
          ↑
        </div>
        <div className="upload-copy">
          <h2 id="upload-heading">Bring in your documents</h2>
          <p>PDF, TXT, or Markdown · up to 15 MB each</p>
        </div>
        <label className={`upload-button ${isUploading ? "is-disabled" : ""}`}>
          {isUploading ? "Uploading…" : "Choose files"}
          <input
            ref={fileInputRef}
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            disabled={isUploading}
            multiple
            onChange={(event) => void uploadFiles(event.target.files)}
            type="file"
          />
        </label>
      </section>

      {notice ? <p className="inline-notice success-notice">{notice}</p> : null}
      {error ? <p className="inline-notice error-notice">{error}</p> : null}

      <section className="library-list" aria-labelledby="library-heading">
        <div className="list-heading">
          <div>
            <p className="kicker">Your sources</p>
            <h2 id="library-heading">Processing queue</h2>
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              void loadDocuments().finally(() => setIsLoading(false));
            }}
            type="button"
          >
            Refresh
          </button>
        </div>

        {readyCount > 0 ? (
          <div className="library-chat-cta">
            <span>
              {readyCount} ready source{readyCount === 1 ? " is" : "s are"}{" "}
              available for grounded retrieval.
            </span>
            <Link href="/chats">Start a conversation →</Link>
          </div>
        ) : null}

        {isLoading ? (
          <div className="library-empty">Loading your documents…</div>
        ) : documents.length === 0 ? (
          <div className="library-empty">
            <span aria-hidden="true">↗</span>
            <h3>Your library is ready for its first source.</h3>
            <p>Upload a document above. Processing begins automatically.</p>
          </div>
        ) : (
          <div className="document-grid">
            {documents.map((document) => (
              <article className="document-card" key={document.id}>
                <div
                  className={`file-tile file-${getFileKind(document).toLowerCase()}`}
                >
                  {getFileKind(document)}
                </div>
                <div className="document-main">
                  <div className="document-title-row">
                    <h3 title={document.name}>{document.name}</h3>
                    <span className={`status-badge status-${document.status}`}>
                      <span aria-hidden="true" />
                      {STATUS_LABELS[document.status]}
                    </span>
                  </div>
                  <p className="document-meta">
                    {formatBytes(document.sizeBytes)}
                    {document.pageCount ? ` · ${document.pageCount} pages` : ""}
                    {document.chunkCount
                      ? ` · ${document.chunkCount} searchable chunks`
                      : ""}
                  </p>

                  {document.status === "processing" ||
                  document.status === "queued" ? (
                    <div className="processing-line">
                      <span />
                      {document.status === "queued"
                        ? "Waiting for the ingestion worker"
                        : "Extracting, chunking, and embedding"}
                    </div>
                  ) : null}

                  {document.status === "ready" ? (
                    <p className="ready-line">
                      Searchable and ready for conversations
                    </p>
                  ) : null}

                  {document.status === "failed" ? (
                    <div className="failure-row">
                      <p>{document.errorMessage ?? "Processing failed."}</p>
                      <button
                        onClick={() => void retryDocument(document.id)}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
