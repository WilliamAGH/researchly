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
    <div className="flex items-center gap-2 pr-2 min-w-0">
      <button
        type="button"
        data-chat-id={String(chat._id)}
        onClick={onSelect}
        className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
          isActive ? "bg-gray-100 dark:bg-gray-800" : ""
        }`}
      >
        <div className="text-xs font-medium truncate min-w-0 leading-tight">
          {chat.title}
        </div>
        <div className="text-[11px] text-gray-500 flex items-center gap-1 min-w-0 mt-0.5">
          <span className="truncate">
            {new Date(chat.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </button>
      <button
        type="button"
        data-chat-id={String(chat._id)}
        data-current={isActive ? "1" : "0"}
        onClick={onDelete}
        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
        title="Delete chat"
        aria-label="Delete chat"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Delete chat"
        >
          <title>Delete chat</title>
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
