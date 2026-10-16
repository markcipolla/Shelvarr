"use client";

import { useState } from "react";
import type { ComicIssueSummary } from "@shelvarr/types";
import type { ComicIssueProgress } from "@/lib/db";
import { MarkIssueReadButton } from "@/components/comics/MarkIssueReadButton";
import { ComicReader } from "@/components/comics/ComicReader";
import { ReleaseSearchPanel } from "@/components/comics/ReleaseSearchPanel";

interface ComicIssueRowProps {
  issue: ComicIssueSummary;
  volumeId: number;
  volumeTitle: string;
  progress?: ComicIssueProgress;
}

/**
 * One row of the volume detail page's issue list.
 *
 * The badges and MarkIssueReadButton keep behaving exactly as they did when
 * this list was rendered entirely server-side — this component only adds a
 * click target (the issue number + title) that opens ComicReader, and only
 * for an issue that actually has a file to read — plus, for an issue with no
 * file, a search for one.
 */
export function ComicIssueRow({
  issue,
  volumeId,
  volumeTitle,
  progress,
}: ComicIssueRowProps) {
  const [showReader, setShowReader] = useState(false);
  const [finding, setFinding] = useState(false);
  const readable = issue.files.length > 0;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => readable && setShowReader(true)}
          disabled={!readable}
          className={`min-w-0 flex-1 text-left ${readable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-shelvarr-text-muted text-sm font-mono w-10 flex-shrink-0">
              #{issue.issue_number}
            </span>
            {issue.title && (
              <span className="text-white truncate">{issue.title}</span>
            )}
          </div>
          {issue.date && (
            <p
              className="text-xs text-shelvarr-text-muted mt-1"
              style={{ paddingLeft: "3.25rem" }}
            >
              {issue.date}
            </p>
          )}
        </button>

        <div className="flex items-center gap-2 text-xs flex-shrink-0">
          {(() => {
            if (progress?.completed) {
              return (
                <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                  Read
                </span>
              );
            }
            if (progress && progress.page > 0) {
              const label = progress.total
                ? `Reading ${progress.page}/${progress.total}`
                : `Reading p.${progress.page}`;
              return (
                <span className="bg-amber-600/20 text-amber-400 px-2 py-1 rounded">
                  {label}
                </span>
              );
            }
            if (readable) {
              return (
                <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded">
                  Downloaded
                </span>
              );
            }
            return (
              <span className="bg-shelvarr-bg text-shelvarr-text-muted px-2 py-1 rounded">
                Missing
              </span>
            );
          })()}
          {!progress?.completed && readable && (
            <MarkIssueReadButton issueId={issue.id} total={progress?.total} />
          )}
          {!readable && (
            <button
              type="button"
              onClick={() => setFinding(!finding)}
              className="px-2 py-1 rounded border border-shelvarr-border text-white hover:border-blue-500"
            >
              {finding ? "Hide" : "Find"}
            </button>
          )}
        </div>
      </div>

      {finding && (
        <div className="mt-3">
          <ReleaseSearchPanel
            volumeId={volumeId}
            issueId={issue.id}
            subject={`${volumeTitle} #${issue.issue_number}`}
            onClose={() => setFinding(false)}
          />
        </div>
      )}

      {showReader && (
        <ComicReader
          issueId={issue.id}
          volumeTitle={volumeTitle}
          issueNumber={issue.issue_number}
          issueTitle={issue.title}
          onClose={() => setShowReader(false)}
        />
      )}
    </div>
  );
}
