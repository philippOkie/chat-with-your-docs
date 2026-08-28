import Link from "next/link";

import { DocumentLibrary } from "@/features/documents/document-library";

export default function DocumentsPage() {
  return (
    <main className="library-page">
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
          <Link href="/chats">Conversations</Link>
          <Link href="/">Overview</Link>
          <span className="phase-pill">
            <span className="phase-dot" /> Complete
          </span>
        </div>
      </nav>
      <DocumentLibrary />
    </main>
  );
}
