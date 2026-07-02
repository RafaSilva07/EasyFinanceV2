import Link from "next/link";

type EmptyStateProps = {
  title: string;
  actionLabel?: string;
  href?: string;
};

export function EmptyState({ title, actionLabel, href }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-5 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {actionLabel && href ? (
        <Link
          href={href}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
