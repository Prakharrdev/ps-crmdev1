"use client";

import React, { useState } from "react";
import { Star } from "lucide-react";

interface RatingProps {
  initialRating?: number;
  onRate?: (rating: number) => void;
  readonly?: boolean;
}

export default function Rating({ initialRating = 0, onRate, readonly = false }: RatingProps) {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);

  // Sync state if initialRating changes from parent
  React.useEffect(() => {
    setRating(initialRating);
  }, [initialRating]);

  const handleRating = (value: number) => {
    if (readonly) return;
    setRating(value);
    if (onRate) onRate(value);
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => handleRating(star)}
          onMouseEnter={() => !readonly && setHoverRating(star)}
          onMouseLeave={() => !readonly && setHoverRating(0)}
          className={`transition-all duration-200 ${
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"
          }`}
        >
          <Star
            size={18}
            className={`${
              star <= (hoverRating || rating)
                ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                : "text-gray-300 dark:text-gray-600"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
