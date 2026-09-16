import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { db } from "../../lib/firebase";

type ViewerRole = "resident" | "volunteer" | "admin";

type ChatMessage = {
  id: string;
  caseId?: string;
  assignmentId?: string;
  senderUid?: string;
  senderName?: string;
  senderRole?: ViewerRole;
  text?: string;
  createdAt?: any;
};

type CaseChatProps = {
  caseId: string;
  assignmentId: string;
  assignmentStatus?: string;
  caseStatus?: string;
  user: any;
  profile: any;
  viewerRole: ViewerRole;
};

const readableAssignmentStates = [
  "accepted",
  "responding",
  "on_site",
  "completed",
];

const writableCaseStates = ["assigned", "in_progress"];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function displayName(user: any, profile: any) {
  return (
    profile?.fullName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    user?.displayName ||
    user?.email ||
    "VolunServe user"
  );
}

function messageTime(value: any) {
  const millis = value?.toMillis?.();
  if (!millis) return "Sending…";

  return new Date(millis).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CaseChat({
  caseId,
  assignmentId,
  assignmentStatus,
  caseStatus,
  user,
  profile,
  viewerRole,
}: CaseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const assignmentState = normalize(assignmentStatus);
  const incidentState = normalize(caseStatus);

  const canRead =
    !!caseId &&
    !!assignmentId &&
    readableAssignmentStates.includes(assignmentState);

  const canSend =
    canRead &&
    writableCaseStates.includes(incidentState);

  useEffect(() => {
    setMessages([]);
    setError("");

    if (!canRead) return;

    const messagesQuery = query(
      collection(db, "caseMessages", caseId, "messages"),
      where("caseId", "==", caseId),
      where("assignmentId", "==", assignmentId),
      limit(100),
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...(item.data() as Omit<ChatMessage, "id">),
            }))
            .sort(
              (a, b) =>
                (a.createdAt?.toMillis?.() || 0) -
                (b.createdAt?.toMillis?.() || 0),
            ),
        );
        setError("");
      },
      (cause) => {
        console.error("case chat listener", cause);
        setError(
          "Case chat is unavailable. Check the deployed Firestore rules and connection.",
        );
      },
    );
  }, [caseId, assignmentId, canRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const quickConfirmations = useMemo(() => {
    if (viewerRole === "volunteer") {
      return [
        "Please confirm your current location and the assistance you still need.",
        "Please confirm the number of people affected and the supplies needed.",
        "I am preparing to respond. Please tell me if the situation or location changes.",
      ];
    }

    if (viewerRole === "resident") {
      return [
        "Yes, I still need assistance and the reported location is correct.",
        "My location or situation has changed. I will send the updated details here.",
        "The listed needs are still correct. Please proceed when ready.",
      ];
    }

    return [
      "Admin/LGU is monitoring this response. Please keep case updates in this chat.",
      "Please confirm any change in location, people affected, or required supplies.",
    ];
  }, [viewerRole]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const clean = text.trim();

    if (!user?.uid || !canSend || sending) return;

    if (!clean) {
      setError("Type a message before sending.");
      return;
    }

    if (clean.length > 1000) {
      setError("Messages are limited to 1,000 characters.");
      return;
    }

    setSending(true);
    setError("");

    try {
      await addDoc(
        collection(db, "caseMessages", caseId, "messages"),
        {
          caseId,
          assignmentId,
          senderUid: user.uid,
          senderName: displayName(user, profile),
          senderRole: viewerRole,
          text: clean,
          createdAt: serverTimestamp(),
        },
      );

      setText("");
    } catch (cause) {
      console.error("case chat send", cause);
      setError(
        "Message could not be sent. Check your connection and the deployed Firestore rules.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      aria-label="Emergency case chat"
      style={{
        display: "block",
        visibility: "visible",
        opacity: 1,
        position: "relative",
        zIndex: 5,
        flex: "0 0 auto",
        width: "100%",
        minHeight: 260,
        margin: "14px 0",
        border: "2px solid #0f766e",
        borderRadius: 14,
        overflow: "visible",
        background: "#ffffff",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .case-chat-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
          padding: 12px 13px;
          border-bottom: 1px solid #e8efed;
          background: #f7fbfa;
        }

        .case-chat-head strong,
        .case-chat-head span {
          display: block;
        }

        .case-chat-head strong {
          color: #0f2740;
          font-size: 13px;
        }

        .case-chat-head span {
          margin-top: 2px;
          color: #64748b;
          font-size: 10.5px;
          line-height: 1.35;
        }

        .case-chat-live {
          flex: 0 0 auto;
          padding: 5px 8px;
          border-radius: 999px;
          background: #e7f8f3;
          color: #0f766e;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .case-chat-messages {
          max-height: 280px;
          overflow-y: auto;
          padding: 12px;
          display: grid;
          gap: 9px;
          background: #f8fafc;
        }

        .case-chat-empty {
          padding: 14px;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          color: #64748b;
          background: #fff;
          font-size: 11px;
          line-height: 1.45;
        }

        .case-chat-message {
          max-width: 86%;
          justify-self: start;
          padding: 9px 10px;
          border: 1px solid #dce5ea;
          border-radius: 12px 12px 12px 4px;
          background: #fff;
        }

        .case-chat-message.mine {
          justify-self: end;
          border-color: #bfe1db;
          border-radius: 12px 12px 4px 12px;
          background: #eaf8f5;
        }

        .case-chat-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
          margin-bottom: 4px;
          color: #64748b;
          font-size: 9px;
        }

        .case-chat-meta b {
          color: #334155;
          font-size: 9.5px;
        }

        .case-chat-role {
          padding: 2px 5px;
          border-radius: 999px;
          background: #eef2f7;
          font-weight: 800;
          text-transform: uppercase;
        }

        .case-chat-message p {
          margin: 0;
          color: #1f2937;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 11px;
          line-height: 1.45;
        }

        .case-chat-quick {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding: 10px 12px 0;
          background: #fff;
        }

        .case-chat-quick button {
          border: 1px solid #d7e4e1;
          border-radius: 999px;
          padding: 6px 8px;
          background: #f7fbfa;
          color: #0f766e;
          font: inherit;
          font-size: 9px;
          font-weight: 750;
          cursor: pointer;
        }

        .case-chat-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          padding: 10px 12px 12px;
          background: #fff;
        }

        .case-chat-form textarea {
          width: 100%;
          min-height: 72px;
          resize: vertical;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 9px 10px;
          color: #0f172a;
          background: #fff;
          font: inherit;
          font-size: 11px;
        }

        .case-chat-form button {
          align-self: end;
          min-height: 38px;
          border: 1px solid #0f766e;
          border-radius: 10px;
          padding: 8px 12px;
          background: #0f766e;
          color: #fff;
          font: inherit;
          font-size: 10.5px;
          font-weight: 800;
          cursor: pointer;
        }

        .case-chat-form button:disabled {
          opacity: .55;
          cursor: wait;
        }

        .case-chat-note,
        .case-chat-error {
          margin: 0;
          padding: 0 12px 10px;
          font-size: 10px;
          line-height: 1.4;
        }

        .case-chat-note { color: #64748b; }
        .case-chat-error { color: #b91c1c; font-weight: 700; }

        @media (max-width: 680px) {
          .case-chat-message { max-width: 95%; }
          .case-chat-form { grid-template-columns: 1fr; }
          .case-chat-form button { width: 100%; }
        }
      `}</style>

      <div className="case-chat-head">
        <div>
          <strong>Case communication</strong>
          <span>
            Resident, assigned responder, and authorized Admin/LGU only.
            Confirm needs and location here before or during response.
          </span>
        </div>
        <span className="case-chat-live">CASE CHAT</span>
      </div>

      {!canRead && (
        <p className="case-chat-error" role="alert">
          Case Chat loaded, but this session does not currently have a readable
          assignment. Check the case ID, assignment ID, and assignment status.
        </p>
      )}

      <div className="case-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="case-chat-empty">
            No messages yet. Use this chat to confirm the current location,
            people affected, assistance required, and supplies before dispatch
            whenever possible.
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderUid === user?.uid;

            return (
              <article
                className={mine ? "case-chat-message mine" : "case-chat-message"}
                key={message.id}
              >
                <div className="case-chat-meta">
                  <b>{message.senderName || "VolunServe user"}</b>
                  <span className="case-chat-role">
                    {message.senderRole || "user"}
                  </span>
                  <span>{messageTime(message.createdAt)}</span>
                </div>
                <p>{message.text || ""}</p>
              </article>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {canSend ? (
        <>
          <div className="case-chat-quick" aria-label="Quick confirmation messages">
            {quickConfirmations.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setText(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <form className="case-chat-form" onSubmit={send}>
            <textarea
              value={text}
              maxLength={1000}
              placeholder="Confirm current location, needs, supplies, or important changes…"
              onChange={(event) => setText(event.target.value)}
              aria-label="Case chat message"
            />
            <button type="submit" disabled={sending || !text.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </>
      ) : (
        <p className="case-chat-note">
          This conversation is read-only because the active response phase has ended.
        </p>
      )}

      {error && (
        <p className="case-chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}