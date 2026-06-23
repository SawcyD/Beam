import { AnimatePresence } from "framer-motion";
import { Inbox } from "lucide-react";
import { useBeamStore } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TransferItem } from "./TransferItem";

export function TransferList() {
  const transfers = useBeamStore((s) => s.transfers);
  // Newest first.
  const list = Object.values(transfers).sort((a, b) => b.startedAt - a.startedAt);

  if (list.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <Inbox className="size-8 text-muted" />
        <p className="text-sm text-muted">
          No transfers yet. Drop files and pick a device to get started, or wait
          for an incoming send.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-2.5 pr-2">
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <TransferItem key={t.id} transfer={t} />
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}
