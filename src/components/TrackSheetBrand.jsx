import { CheckSquare } from 'lucide-react';

function TrackSheetBrand({ onNavigate, subtitle }) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-label="Track Sheet — go to dashboard"
      title="Go to dashboard"
      className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg text-left transition-opacity hover:opacity-80"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EDEDED]">
        <CheckSquare size={16} className="text-black" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold tracking-tight">Track Sheet</span>
        {subtitle && (
          <span className="block truncate text-[10px] leading-tight text-[#A1A1A1]">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

export default TrackSheetBrand;
