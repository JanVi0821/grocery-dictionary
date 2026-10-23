"use client";

import { Rating, Star, type ItemStyles } from "@smastrom/react-rating";

const starStyles: ItemStyles = {
  itemShapes: Star,
  activeFillColor: "var(--color-brand-butter)",
  activeStrokeColor: "var(--color-warning)",
  inactiveFillColor: "var(--color-surface-muted)",
  inactiveStrokeColor: "var(--color-border)",
};

export function HealthStarRating({ value }: { value: number }) {
  const rating = Math.min(Math.max(value, 0), 5);

  return (
    <div className="flex items-center gap-control-gap">
      <div className="w-32">
        <Rating
          value={rating}
          readOnly
          itemStyles={starStyles}
          invisibleLabel={`Health star rating: ${rating} out of 5`}
        />
      </div>
      <span className="font-semibold text-foreground">{rating}/5</span>
    </div>
  );
}
