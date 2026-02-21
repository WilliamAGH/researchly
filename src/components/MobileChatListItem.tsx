import type { Chat } from "@/lib/types/chat";

interface MobileChatListItemProps {
  chat: Chat;
  isActive: boolean;
  onSelect: React.MouseEventHandler<HTMLButtonElement>;
  onDelete: React.MouseEventHandler<HTMLButtonElement>;
}

/** Single chat entry in the mobile sidebar list (select + delete buttons). */
export function MobileChatListItem({
  chat,
  isActive,
  onSelect,
  onDelete,
}: Readonly<MobileChatListItemProps>) {
  return (
    <div className="group flex items-start gap-1.5 min-w-0">
      <button
        type="button"
        data-chat-id={String(chat._id)}
        onClick={onSelect}
        className={`flex-1 min-w-0 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
          isActive
            ? "bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200/60 dark:ring-emerald-700/40"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
        }`}
      >
        <div
          className={`text-[13px] font-medium leading-snug line-clamp-2 min-w-0 ${
            isActive
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {chat.title}
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-ui">
          {new Date(chat.updatedAt).toLocaleDateString()}
        </div>
      </button>
      <button
        type="button"
        data-chat-id={String(chat._id)}
        data-current={isActive ? "1" : "0"}
        onClick={onDelete}
        className="flex-shrink-0 mt-2 p-1.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-all duration-150"
        title="Delete chat"
        aria-label="Delete chat"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
