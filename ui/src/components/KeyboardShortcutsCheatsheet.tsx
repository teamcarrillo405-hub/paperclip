import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";

interface ShortcutEntry {
  keys: string[];
  label: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    title: "Inbox",
    shortcuts: [
      { keys: ["j"], label: "Move down" },
      { keys: ["↓"], label: "Move down" },
      { keys: ["k"], label: "Move up" },
      { keys: ["↑"], label: "Move up" },
      { keys: ["←"], label: "Collapse selected group" },
      { keys: ["→"], label: "Expand selected group" },
      { keys: ["Enter"], label: "Open selected item" },
      { keys: ["a"], label: "Archive item" },
      { keys: ["y"], label: "Archive item" },
      { keys: ["r"], label: "Mark as read" },
      { keys: ["U"], label: "Mark as unread" },
    ],
  },
  {
    title: "Issue detail",
    shortcuts: [
      { keys: ["y"], label: "Quick-archive back to inbox" },
      { keys: ["g", "i"], label: "Go to inbox" },
      { keys: ["g", "c"], label: "Focus comment composer" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["D"], label: "Go to Dashboard" },
      { keys: ["I"], label: "Go to Inbox" },
      { keys: ["S"], label: "Go to Issues" },
      { keys: ["P"], label: "Go to Projects" },
      { keys: ["G"], label: "Go to Goals" },
      { keys: ["A"], label: "Go to Agents" },
    ],
  },
  {
    title: "Approvals",
    shortcuts: [
      { keys: ["j"], label: "Navigate to next approval" },
      { keys: ["k"], label: "Navigate to previous approval" },
      { keys: ["a"], label: "Approve focused item" },
      { keys: ["r"], label: "Reject focused item" },
    ],
  },
  {
    title: "Global",
    shortcuts: [
      { keys: ["⌘", "k"], label: "Open command palette" },
      { keys: ["/"], label: "Search current page" },
      { keys: ["c"], label: "New issue" },
      { keys: ["["], label: "Toggle sidebar" },
      { keys: ["]"], label: "Toggle panel" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-[0_1px_0_1px_hsl(var(--border))]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filteredSections = sections
    .map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter(
        (s) =>
          !q ||
          s.label.toLowerCase().includes(q) ||
          s.keys.some((k) => k.toLowerCase().includes(q)) ||
          section.title.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.shortcuts.length > 0);

  return (
    <>
      {/* Search */}
      <div className="relative border-b border-border px-4 py-2">
        <Search className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter shortcuts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
      </div>

      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {filteredSections.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">No shortcuts match.</p>
        ) : (
          filteredSections.map((section) => (
            <div key={section.title} className="px-5 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label + shortcut.keys.join()}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-foreground/90">{shortcut.label}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={key + i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-muted-foreground">then</span>}
                          <KeyCap>{key}</KeyCap>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Press <KeyCap>Esc</KeyCap> to close &middot; Shortcuts are disabled in text fields
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
