"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Answerability = "grounded" | "partial" | "not_found";
type MessageStatus = "completed" | "failed" | "streaming";

type DocumentRecord = {
  id: string;
  name: string;
  status: "failed" | "processing" | "queued" | "ready";
};

type PublicSource = {
  chunkId: string;
  cosineDistance: number;
  documentName: string;
  excerpt: string;
  location: string;
  rank: number;
};

type ChatMessage = {
  answerability: Answerability | null;
  content: string;
  createdAt: string;
  generalKnowledge: string | null;
  id: string;
  role: "assistant" | "user";
  sources: PublicSource[];
  status: MessageStatus;
};

type ChatDetail = {
  createdAt: string;
  documents: DocumentRecord[];
  id: string;
  messages: ChatMessage[];
  title: string;
  updatedAt: string;
};

type ChatSummary = {
  documents: { id: string; name: string }[];
  id: string;
  lastMessage: {
    content: string;
    createdAt: string;
    role: "assistant" | "user";
  } | null;
  title: string;
  updatedAt: string;
};

type ErrorPayload = { error?: { message?: string } };

type StreamEvent =
  | { stage: "answering" | "retrieving" | "rewriting"; type: "status" }
  | { text: string; type: "answer.delta" | "general.delta" }
  | { sources: PublicSource[]; type: "sources" }
  | {
      answerability: Answerability;
      messageId: string;
      type: "done";
    }
  | { message: string; retryable: boolean; type: "error" }
  | { type: "usage" };

const STAGE_LABELS = {
  answering: "Writing a grounded answer",
  retrieving: "Finding the strongest excerpts",
  rewriting: "Understanding the question",
} as const;

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  return payload.error?.message ?? "Something went wrong. Please try again.";
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function similarityLabel(distance: number): string {
  const similarity = Math.max(0, Math.min(1, 1 - distance));
  if (similarity >= 0.75) return "Strong match";
  if (similarity >= 0.55) return "Useful match";
  return "Supporting context";
}

function temporaryMessage(
  role: "assistant" | "user",
  content: string,
): ChatMessage {
  return {
    answerability: null,
    content,
    createdAt: new Date().toISOString(),
    generalKnowledge: null,
    id: `temporary-${role}-${crypto.randomUUID()}`,
    role,
    sources: [],
    status: role === "assistant" ? "streaming" : "completed",
  };
}

function inlineMarkdown(value: string): ReactNode[] {
  return value
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
}

function SafeMarkdown({ value }: { value: string }) {
  return value.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return (
        <ul key={blockIndex}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>
              {inlineMarkdown(line.replace(/^[-*]\s+/, ""))}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={blockIndex}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 ? <br /> : null}
            {inlineMarkdown(line)}
          </span>
        ))}
      </p>
    );
  });
}

export function ChatWorkspace({ initialChatId }: { initialChatId?: string }) {
  const router = useRouter();
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail>();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [stage, setStage] = useState<keyof typeof STAGE_LABELS>();
  const [error, setError] = useState<string>();

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );

  const loadChat = useCallback(async (chatId: string) => {
    const response = await fetch(`/api/chats/${chatId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = (await response.json()) as { chat: ChatDetail };
    setActiveChat(payload.chat);
    setSelection(
      new Set(payload.chat.documents.map((document) => document.id)),
    );
    return payload.chat;
  }, []);

  const loadChatList = useCallback(async () => {
    const response = await fetch("/api/chats", { cache: "no-store" });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = (await response.json()) as { chats: ChatSummary[] };
    setChats(payload.chats);
    return payload.chats;
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      fetch("/api/documents", { cache: "no-store" }),
      fetch("/api/chats", { cache: "no-store" }),
    ])
      .then(async ([documentResponse, chatResponse]) => {
        if (!documentResponse.ok) {
          throw new Error(await errorMessage(documentResponse));
        }
        if (!chatResponse.ok) throw new Error(await errorMessage(chatResponse));
        const documentPayload = (await documentResponse.json()) as {
          documents: DocumentRecord[];
        };
        const chatPayload = (await chatResponse.json()) as {
          chats: ChatSummary[];
        };
        if (!mounted) return;
        setDocuments(documentPayload.documents);
        setChats(chatPayload.chats);
        const requestedId = initialChatId ?? chatPayload.chats[0]?.id;
        if (requestedId) await loadChat(requestedId);
      })
      .catch((loadError: unknown) => {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The conversation workspace could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [initialChatId, loadChat]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, stage]);

  const openChat = async (chatId: string) => {
    if (isSending) return;
    setError(undefined);
    try {
      await loadChat(chatId);
      router.push(`/chats/${chatId}`);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "The conversation could not be opened.",
      );
    }
  };

  const beginNewChat = () => {
    if (isSending) return;
    setActiveChat(undefined);
    setSelection(new Set());
    setError(undefined);
    router.push("/chats");
  };

  const toggleDocument = (documentId: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const createConversation = async () => {
    if (selection.size === 0) {
      setError("Select at least one ready document to start a conversation.");
      return;
    }
    setIsCreating(true);
    setError(undefined);
    try {
      const response = await fetch("/api/chats", {
        body: JSON.stringify({ documentIds: [...selection] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { chat: ChatDetail };
      setActiveChat(payload.chat);
      setSelection(
        new Set(payload.chat.documents.map((document) => document.id)),
      );
      await loadChatList();
      router.replace(`/chats/${payload.chat.id}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The conversation could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const saveSelection = async () => {
    if (!activeChat || selection.size === 0) {
      setError("Keep at least one ready document selected.");
      return;
    }
    setIsSavingSelection(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/chats/${activeChat.id}/documents`, {
        body: JSON.stringify({ documentIds: [...selection] }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { chat: ChatDetail };
      setActiveChat(payload.chat);
      await loadChatList();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The source selection could not be saved.",
      );
    } finally {
      setIsSavingSelection(false);
    }
  };

  const applyStreamEvent = (assistantId: string, event: StreamEvent) => {
    if (event.type === "status") {
      setStage(event.stage);
      return;
    }
    if (event.type === "usage") return;
    if (event.type === "error") {
      setError(event.message);
      setActiveChat((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, status: "failed" }
                  : message,
              ),
            }
          : current,
      );
      return;
    }

    setActiveChat((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((message) => {
          if (message.id !== assistantId) return message;
          if (event.type === "answer.delta") {
            return { ...message, content: message.content + event.text };
          }
          if (event.type === "general.delta") {
            return {
              ...message,
              generalKnowledge: (message.generalKnowledge ?? "") + event.text,
            };
          }
          if (event.type === "sources") {
            return { ...message, sources: event.sources };
          }
          if (event.type === "done") {
            return {
              ...message,
              answerability: event.answerability,
              id: event.messageId,
              status: "completed",
            };
          }
          return message;
        }),
      };
    });
  };

  const sendQuestion = async (content: string) => {
    if (!activeChat || isSending || !content.trim()) return;
    const userMessage = temporaryMessage("user", content.trim());
    const assistantMessage = temporaryMessage("assistant", "");
    const assistantId = assistantMessage.id;

    setQuestion("");
    setError(undefined);
    setIsSending(true);
    setStage("rewriting");
    setActiveChat((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, userMessage, assistantMessage],
          }
        : current,
    );

    let completed = false;
    let streamError = false;
    try {
      const response = await fetch(`/api/chats/${activeChat.id}/messages`, {
        body: JSON.stringify({ content: content.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      if (!response.body) throw new Error("The answer stream did not start.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) {
            const event = JSON.parse(data) as StreamEvent;
            applyStreamEvent(assistantId, event);
            if (event.type === "done") completed = true;
            if (event.type === "error") streamError = true;
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }

      if (!completed && !streamError) {
        throw new Error(
          "The connection ended before the answer finished. The received text was kept; you can retry.",
        );
      }
      if (completed) {
        await Promise.all([loadChat(activeChat.id), loadChatList()]);
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The answer was interrupted. You can retry it.",
      );
      setActiveChat((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, status: "failed" }
                  : message,
              ),
            }
          : current,
      );
    } finally {
      setIsSending(false);
      setStage(undefined);
    }
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(question);
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (question.trim() && !isSending) void sendQuestion(question);
    }
  };

  const retryMessage = (messageIndex: number) => {
    if (!activeChat) return;
    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      const message = activeChat.messages[index];
      if (message.role === "user") {
        void sendQuestion(message.content);
        return;
      }
    }
  };

  return (
    <main className="chat-page">
      <nav className="nav" aria-label="Primary navigation">
        <Link className="brand" href="/" aria-label="Chat With Your Docs home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Chat With Your Docs</span>
        </Link>
        <div className="library-nav-actions">
          <Link href="/documents">Document library</Link>
          <span className="phase-pill">
            <span className="phase-dot" /> Complete
          </span>
        </div>
      </nav>

      {error ? (
        <div className="chat-global-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(undefined)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      <section
        className="chat-shell"
        aria-label="Document conversation workspace"
      >
        <aside className="chat-list-panel">
          <div className="chat-panel-heading">
            <div>
              <p className="kicker">Workspace</p>
              <h1>Conversations</h1>
            </div>
            <button
              aria-label="Start a new conversation"
              disabled={isSending}
              onClick={beginNewChat}
              type="button"
            >
              +
            </button>
          </div>
          <div className="chat-list">
            {isLoading ? (
              <p className="panel-note">Loading conversations…</p>
            ) : null}
            {!isLoading && chats.length === 0 ? (
              <p className="panel-note">
                Your first conversation will appear here.
              </p>
            ) : null}
            {chats.map((chat) => (
              <button
                className={activeChat?.id === chat.id ? "is-active" : ""}
                disabled={isSending}
                key={chat.id}
                onClick={() => void openChat(chat.id)}
                type="button"
              >
                <strong>{chat.title}</strong>
                <span>
                  {chat.documents.length} source
                  {chat.documents.length === 1 ? "" : "s"} ·{" "}
                  {shortDate(chat.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="conversation-panel">
          {!activeChat ? (
            <div className="conversation-onboarding">
              <span className="onboarding-mark" aria-hidden="true">
                ✦
              </span>
              <p className="kicker">New conversation</p>
              <h2>Choose the evidence first.</h2>
              <p>
                Every answer will search only the ready documents you select in
                the source panel. You can change that set between questions.
              </p>
              {readyDocuments.length > 0 ? (
                <button
                  className="primary-action"
                  disabled={isCreating || selection.size === 0}
                  onClick={() => void createConversation()}
                  type="button"
                >
                  {isCreating ? "Starting…" : "Start conversation"}
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <Link className="primary-action" href="/documents">
                  Upload a document <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          ) : (
            <>
              <header className="conversation-header">
                <div>
                  <p className="kicker">Grounded workspace</p>
                  <h2>{activeChat.title}</h2>
                </div>
                <div className="selected-source-count">
                  <strong>{activeChat.documents.length}</strong>
                  <span>selected sources</span>
                </div>
              </header>

              <div className="message-thread" aria-live="polite">
                {activeChat.messages.length === 0 ? (
                  <div className="thread-empty">
                    <span aria-hidden="true">↗</span>
                    <h3>Ask the documents anything.</h3>
                    <p>
                      Try a direct fact, a comparison across sources, or a
                      follow-up such as “What about the second document?”
                    </p>
                  </div>
                ) : null}

                {activeChat.messages.map((message, index) =>
                  message.role === "user" ? (
                    <article className="chat-user-message" key={message.id}>
                      <p>{message.content}</p>
                    </article>
                  ) : (
                    <article
                      className={`chat-assistant-message message-${message.status}`}
                      key={message.id}
                    >
                      <div className="assistant-message-topline">
                        <span className="answer-spark" aria-hidden="true">
                          ✦
                        </span>
                        <span
                          className={`answerability-badge answerability-${message.answerability ?? "pending"}`}
                        >
                          {message.status === "streaming"
                            ? stage
                              ? STAGE_LABELS[stage]
                              : "Working"
                            : message.status === "failed"
                              ? "Incomplete"
                              : message.answerability === "not_found"
                                ? "Not found"
                                : message.answerability === "partial"
                                  ? "Partially grounded"
                                  : "Grounded"}
                        </span>
                      </div>
                      {message.content ? (
                        <div className="assistant-copy">
                          <SafeMarkdown value={message.content} />
                        </div>
                      ) : (
                        <div className="answer-thinking">
                          <span />
                          <span />
                          <span />
                        </div>
                      )}

                      {message.generalKnowledge ? (
                        <aside className="general-context">
                          <strong>General context</strong>
                          <p>
                            This information is useful background, but it does
                            not come from the selected documents.
                          </p>
                          <div>
                            <SafeMarkdown value={message.generalKnowledge} />
                          </div>
                        </aside>
                      ) : null}

                      {message.sources.length > 0 ? (
                        <div className="message-sources">
                          <div className="sources-heading">
                            <strong>Sources</strong>
                            <span>Exact stored excerpts</span>
                          </div>
                          {message.sources.map((source) => (
                            <details
                              className="source-card"
                              key={source.chunkId}
                            >
                              <summary>
                                <span className="source-number">
                                  {source.rank}
                                </span>
                                <span className="source-title">
                                  <strong>{source.documentName}</strong>
                                  <small>{source.location}</small>
                                </span>
                                <span className="source-match">
                                  {similarityLabel(source.cosineDistance)}
                                </span>
                              </summary>
                              <blockquote>{source.excerpt}</blockquote>
                            </details>
                          ))}
                        </div>
                      ) : null}

                      {message.status === "failed" ? (
                        <button
                          className="retry-answer"
                          disabled={isSending}
                          onClick={() => retryMessage(index)}
                          type="button"
                        >
                          Retry this question
                        </button>
                      ) : null}
                    </article>
                  ),
                )}
                <div ref={messageEndRef} />
              </div>

              <form className="question-composer" onSubmit={submitQuestion}>
                <textarea
                  aria-label="Ask a question about the selected documents"
                  disabled={isSending}
                  maxLength={4000}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleComposerKey}
                  placeholder="Ask a question about the selected documents…"
                  rows={2}
                  value={question}
                />
                <button
                  aria-label="Send question"
                  disabled={isSending || !question.trim()}
                  type="submit"
                >
                  {isSending ? "•••" : "↑"}
                </button>
                <p>
                  Enter to send · Shift + Enter for a new line · General
                  knowledge is labelled separately
                </p>
              </form>
            </>
          )}
        </section>

        <aside className="source-selection-panel">
          <div className="source-panel-heading">
            <p className="kicker">Retrieval scope</p>
            <h2>Sources</h2>
            <p>Only checked documents can be searched in this conversation.</p>
          </div>
          {readyDocuments.length === 0 ? (
            <div className="no-ready-sources">
              <p>No ready documents yet.</p>
              <Link href="/documents">Open the library</Link>
            </div>
          ) : (
            <div className="source-checkbox-list">
              {readyDocuments.map((document) => (
                <label key={document.id}>
                  <input
                    checked={selection.has(document.id)}
                    disabled={isSending || isSavingSelection}
                    onChange={() => toggleDocument(document.id)}
                    type="checkbox"
                  />
                  <span className="custom-check" aria-hidden="true" />
                  <span>
                    <strong>{document.name}</strong>
                    <small>Ready to search</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {activeChat ? (
            <button
              className="save-sources-button"
              disabled={isSending || isSavingSelection || selection.size === 0}
              onClick={() => void saveSelection()}
              type="button"
            >
              {isSavingSelection ? "Saving…" : "Save source selection"}
            </button>
          ) : null}
          <p className="source-privacy-note">
            Document text is treated as untrusted data and is never written to
            normal application logs.
          </p>
        </aside>
      </section>
    </main>
  );
}
