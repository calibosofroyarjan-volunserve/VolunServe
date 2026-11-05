/**
 * Pure client-side Assistance Requests queue selection.
 * Keep it independent from Firebase, React, and any production writes
 * so the exact filters and sorting can be regression-tested offline.
 */
export type AssistanceQueueStatus =
  | "all"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "completed";

export type AssistanceQueueSort =
  | "newest"
  | "oldest"
  | "resident_az"
  | "resident_za"
  | "title_az"
  | "title_za";

type AssistanceQueueRecord = {
  id: string;
  status?: string;
  category?: string;
  requestId?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterBarangay?: string;
  beneficiaryName?: string;
  categoryLabel?: string;
  title?: string;
  createdAt?: unknown;
};

type AssistanceQueueOptions = {
  status: AssistanceQueueStatus;
  category: string;
  sort: AssistanceQueueSort;
  search: string;
};

const completedStatuses = new Set([
  "assistance_provided",
  "campaign_created",
  "closed",
]);

export function filterAndSortAssistanceQueue<T extends AssistanceQueueRecord>(
  requests: readonly T[],
  options: AssistanceQueueOptions,
  getTimestamp: (value: unknown) => number,
): T[] {
  const term = options.search.trim().toLowerCase();

  return requests
    .filter((item) => {
      const currentStatus = String(item.status || "pending");
      const statusMatches =
        options.status === "all" ||
        (options.status === "completed"
          ? completedStatuses.has(currentStatus)
          : currentStatus === options.status);

      if (!statusMatches) return false;
      if (options.category !== "all" && item.category !== options.category) {
        return false;
      }

      if (!term) return true;

      return [
        item.requestId,
        item.requesterName,
        item.requesterEmail,
        item.requesterBarangay,
        item.beneficiaryName,
        item.categoryLabel,
        item.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => {
      const nameA = String(a.requesterName || a.beneficiaryName || "").trim();
      const nameB = String(b.requesterName || b.beneficiaryName || "").trim();
      const titleA = String(a.title || "").trim();
      const titleB = String(b.title || "").trim();
      const stable = String(a.id).localeCompare(String(b.id));

      switch (options.sort) {
        case "resident_az":
          return nameA.localeCompare(nameB, "en", { sensitivity: "base" }) || stable;
        case "resident_za":
          return nameB.localeCompare(nameA, "en", { sensitivity: "base" }) || stable;
        case "title_az":
          return titleA.localeCompare(titleB, "en", { sensitivity: "base" }) || stable;
        case "title_za":
          return titleB.localeCompare(titleA, "en", { sensitivity: "base" }) || stable;
        case "oldest":
          return getTimestamp(a.createdAt) - getTimestamp(b.createdAt) || stable;
        default:
          return getTimestamp(b.createdAt) - getTimestamp(a.createdAt) || stable;
      }
    });
}
