import { useEffect, useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import type { User } from "firebase/auth";

export default function AccountMenu({
  user,
  onLogout,
}: {
  user: Pick<User, "displayName" | "email">;
  onLogout: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const name = user.displayName || user.email || "Google 계정";
  const initial = Array.from(name.trim())[0] || "G";

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const details = menu.current;
      if (
        details?.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      )
        details.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details
      className="account"
      ref={menu}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.currentTarget.open = false;
          trigger.current?.focus();
        }
      }}
    >
      <summary ref={trigger} title={name} aria-label="계정">
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="account-actions">
        <button
          type="button"
          onClick={() => {
            if (menu.current) menu.current.open = false;
            trigger.current?.focus();
            onLogout();
          }}
        >
          <LogOut size={16} aria-hidden="true" /> 로그아웃
        </button>
      </div>
    </details>
  );
}
