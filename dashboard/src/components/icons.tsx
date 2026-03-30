/** Shared outline icons (match SnippetModal code-block actions). */

export function IconClipboard({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

export function IconCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Open in external window / explorer (outline, same stroke as clipboard). */
export function IconArrowTopRightOnSquare({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5M19.5 3h-6m6 0v6m0-6L10.5 14.25"
      />
    </svg>
  );
}

export function IconArrowUp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

export function IconArrowDown({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** Trash / delete (outline). */
export function IconTrash({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
