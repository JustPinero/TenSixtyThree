"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

/**
 * 54.4 — kanban boards. Personal + active-org boards; drag tickets
 * between columns (dnd-kit); org boards can pull Linear issues in.
 */

interface Board {
  id: string;
  name: string;
  organizationId: string | null;
}
interface Column {
  id: string;
  name: string;
  position: number;
}
interface Ticket {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: string;
  position: number;
  linearIssueId: string | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-danger",
  high: "text-amber",
  normal: "text-text-dim",
  low: "text-text-dim",
};

function TicketCard({
  ticket,
  dragging,
}: {
  ticket: Ticket;
  dragging?: boolean;
}) {
  return (
    <div
      className={`p-2 border bg-space-800 text-left ${dragging ? "border-cyan glow-border" : "border-space-600"}`}
    >
      <p className="text-xs font-mono text-text-bright">{ticket.title}</p>
      <p
        className={`text-[10px] font-mono uppercase ${PRIORITY_COLOR[ticket.priority] ?? "text-text-dim"}`}
      >
        {ticket.priority}
        {ticket.linearIssueId && <span className="ml-2 text-info">linear</span>}
      </p>
    </div>
  );
}

function DraggableTicket({ ticket }: { ticket: Ticket }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      <TicketCard ticket={ticket} />
    </div>
  );
}

function DroppableColumn({
  column,
  tickets,
  onAdd,
}: {
  column: Column;
  tickets: Ticket[];
  onAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draft, setDraft] = useState("");
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-56 p-2 border bg-space-900/60 ${isOver ? "border-cyan" : "border-space-600"}`}
    >
      <h3 className="text-xs font-mono font-bold text-cyan uppercase tracking-wider mb-2">
        {column.name} <span className="text-text-dim">({tickets.length})</span>
      </h3>
      <div className="space-y-2 mb-2 min-h-8">
        {tickets.map((t) => (
          <DraggableTicket key={t.id} ticket={t} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            onAdd(draft.trim());
            setDraft("");
          }
        }}
        className="flex gap-1"
      >
        <label className="sr-only" htmlFor={`add-${column.id}`}>
          Add ticket to {column.name}
        </label>
        <input
          id={`add-${column.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add ticket…"
          className="flex-1 bg-space-900 border border-space-600 px-2 py-1 text-xs font-mono text-text-bright"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="border border-space-600 px-2 text-xs font-mono text-text-dim hover:text-cyan hover:border-cyan disabled:opacity-40"
          aria-label={`Add ticket to ${column.name}`}
        >
          +
        </button>
      </form>
    </div>
  );
}

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [newBoard, setNewBoard] = useState("");
  const [dragTicket, setDragTicket] = useState<Ticket | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const refreshBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      if (!res.ok) {
        setSignedOut(true);
        return;
      }
      const data = await res.json();
      setBoards(data.boards);
      if (data.boards.length > 0) {
        setActiveBoard((prev) => prev ?? data.boards[0].id);
      }
    } catch {
      setSignedOut(true);
    }
  }, []);

  const refreshBoard = useCallback(async (id: string) => {
    const res = await fetch(`/api/boards/${id}`);
    if (res.ok) {
      const data = await res.json();
      setColumns(data.columns);
      setTickets(data.tickets);
    }
  }, []);

  useEffect(() => {
    refreshBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeBoard) refreshBoard(activeBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard]);

  async function handleDragEnd(event: DragEndEvent) {
    setDragTicket(null);
    const ticketId = String(event.active.id);
    const overColumn = event.over ? String(event.over.id) : null;
    if (!overColumn) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.columnId === overColumn) return;
    const columnTickets = tickets.filter((t) => t.columnId === overColumn);
    const lastPos = columnTickets.reduce(
      (max, t) => Math.max(max, t.position),
      0,
    );
    // Optimistic move
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, columnId: overColumn, position: lastPos + 1024 }
          : t,
      ),
    );
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ticketId,
        columnId: overColumn,
        position: lastPos + 1024,
      }),
    });
    if (activeBoard) refreshBoard(activeBoard);
  }

  if (signedOut) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-2">
          Boards
        </h1>
        <p className="text-sm font-mono text-text-dim">
          Sign in to use kanban boards.
        </p>
      </main>
    );
  }
  if (boards === null) {
    return (
      <main className="p-8">
        <p className="text-sm font-mono text-text-dim">Loading boards…</p>
      </main>
    );
  }

  const board = boards.find((b) => b.id === activeBoard) ?? null;

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider">
          Boards
        </h1>
        {boards.length > 0 && (
          <>
            <label htmlFor="board-picker" className="sr-only">
              Board
            </label>
            <select
              id="board-picker"
              value={activeBoard ?? ""}
              onChange={(e) => setActiveBoard(e.target.value)}
              className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.organizationId ? " (org)" : ""}
                </option>
              ))}
            </select>
          </>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch("/api/boards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newBoard, scope: "personal" }),
            });
            if (res.ok) {
              setNewBoard("");
              refreshBoards();
            }
          }}
          className="flex gap-2"
        >
          <label htmlFor="new-board" className="sr-only">
            New board name
          </label>
          <input
            id="new-board"
            value={newBoard}
            onChange={(e) => setNewBoard(e.target.value)}
            placeholder="New board"
            className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
          />
          <button
            type="submit"
            disabled={!newBoard.trim()}
            className="border border-cyan px-2 py-1.5 text-xs font-mono uppercase text-cyan disabled:opacity-50"
          >
            Create
          </button>
        </form>
        {board?.organizationId && (
          <button
            onClick={async () => {
              setSyncNote("Syncing…");
              const res = await fetch("/api/orgs/linear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ boardId: board.id }),
              });
              const data = await res.json();
              setSyncNote(
                res.ok
                  ? `Linear: +${data.created} new, ${data.updated} updated`
                  : (data.error ?? "Sync failed"),
              );
              refreshBoard(board.id);
            }}
            className="border border-info px-2 py-1.5 text-xs font-mono uppercase text-info ml-auto"
          >
            Sync Linear
          </button>
        )}
        {syncNote && (
          <span className="text-xs font-mono text-text-dim">{syncNote}</span>
        )}
      </div>

      {board ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setDragTicket(tickets.find((t) => t.id === e.active.id) ?? null)
          }
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                column={col}
                tickets={tickets
                  .filter((t) => t.columnId === col.id)
                  .sort((a, b) => a.position - b.position)}
                onAdd={async (title) => {
                  await fetch("/api/tickets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      boardId: board.id,
                      columnId: col.id,
                      title,
                    }),
                  });
                  refreshBoard(board.id);
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {dragTicket ? <TicketCard ticket={dragTicket} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <p className="text-sm font-mono text-text-dim">
          No boards yet — create one above. Org boards appear when your active
          organization has them.
        </p>
      )}
    </main>
  );
}
