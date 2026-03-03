'use client';

export default function ChatBubble() {
    return (
        <button
            aria-label="Open chat"
            className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/40 hover:bg-emerald-400 transition-colors duration-300 group"
            style={{ animation: 'floatBubble 3s ease-in-out infinite' }}
        >
            {/* Scale on hover via inner wrapper to avoid fighting the float animation */}
            <span className="flex items-center justify-center w-full h-full group-hover:scale-110 transition-transform duration-300">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-6 h-6 text-white"
                    aria-hidden="true"
                >
                    <path
                        fillRule="evenodd"
                        d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223Z"
                        clipRule="evenodd"
                    />
                </svg>
            </span>
        </button>
    );
}
