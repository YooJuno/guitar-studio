import { Bookmark } from "lucide-react";

export default function FavoriteButton({
  saved,
  onClick,
  label,
}: {
  saved: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`icon-button music-favorite ${saved ? "saved" : ""}`}
      aria-label={`${label} 즐겨찾기 ${saved ? "해제" : "추가"}`}
      title={saved ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={saved}
      onClick={onClick}
    >
      <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
