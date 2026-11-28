"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ScopeSelect, useActiveOrg, type Scope } from "../components/scope-select";
import { TicketDialog } from "./ticket-dialog";
import { PageSkeleton } from "../components/loading-skeleton";

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
  assigneeUserId?: string | null;
  milestoneId?: string | null;
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
        className={`text-micro font-mono uppercase ${PRIORITY_COLOR[ticket.priority] ?? "text-text-dim"}`}
      >
        {ticket.priority}
        {ticket.linearIssueId && <span className="ml-2 text-info">linear</span>}
      </p>
    </div>
  );
}

function DraggableTicket({
  ticket,
  columns,
  onOpen,
  onMove,
}: {
  ticket: Ticket;
  columns: Column[];
  onOpen: (ticket: Ticket) => void;
  onMove: (ticketId: string, columnId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
  });
  // 72 — the drag handle has a name (Space lifts it with the keyboard
  // sensor); Edit and "Move to…" are real controls outside the handle so
  // they never start a drag.
  return (
    <div className={isDragging ? "opacity-30" : ""}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Ticket ${ticket.title}, ${ticket.priority} priority. Press space to drag.`}
        aria-roledescription="draggable ticket"
      >
        <TicketCard ticket={ticket} />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <button
          type="button"
          onClick={() => onOpen(ticket)}
          aria-label={`Edit ticket ${ticket.title}`}
          className="min-h-6 text-micro font-mono text-cyan underline focus-ring"
        >
          Edit
        </button>
        <label htmlFor={`move-${ticket.id}`} className="sr-only">
          Move {ticket.title} to
        </label>
        <select
          id={`move-${ticket.id}`}
          value=""
          onChange={(e) => {
            if (e.target.value) onMove(ticket.id, e.target.value);
          }}
          className="min-h-6 bg-space-900 border border-space-600 px-1 py-0.5 text-micro font-mono text-text"
        >
          <option value="">Move to…</option>
          {columns
            .filter((c) => c.id !== ticket.columnId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  columns,
  tickets,
  onAdd,
  onOpen,
  onMove,
}: {
  column: Column;
  columns: Column[];
  tickets: Ticket[];
  /** Resolves true when the ticket was created (72: the draft stays otherwise). */
  onAdd: (title: string) => Promise<boolean>;
  onOpen: (ticket: Ticket) => void;
  onMove: (ticketId: string, columnId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
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
          <DraggableTicket key={t.id} ticket={t} columns={columns} onOpen={onOpen} onMove={onMove} />
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim() || adding) return;
          setAdding(true);
          try {
            if (await onAdd(draft.trim())) setDraft("");
          } finally {
            setAdding(false);
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
          disabled={!draft.trim() || adding}
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
  // 68.4 — new boards can belong to the active org.
  const activeOrg = useActiveOrg();
  const [newBoardScope, setNewBoardScope] = useState<Scope>("personal");
  const [dragTicket, setDragTicket] = useState<Ticket | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // 72 — drag with the keyboard too (Space to lift, arrows, Space to drop).
    useSensor(KeyboardSensor),
  );
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  // 72 — who a ticket on this board may be assigned to.
  const [assignees, setAssignees] = useState<{ userId: string; label: string }[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  // 77 — which board's columns are on screen; until it matches the active
  // board, show a placeholder instead of an empty board.
  const [loadedBoardId, setLoadedBoardId] = useState<string | null>(null);

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
    setLoadedBoardId(id);
  }, []);

  useEffect(() => {
    refreshBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = boards?.find((b) => b.id === activeBoard);
    if (!current) return;
    let cancelled = false;
    const load: Promise<{ userId: string; label: string }[]> = current.organizationId
      ? fetch("/api/orgs/members")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) =>
            Array.isArray(data?.members)
              ? data.members.map((m: { userId: string; name: string; email: string }) => ({
                  userId: m.userId,
                  label: m.name || m.email,
                }))
              : [],
          )
      : fetch("/api/account")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => (data?.user?.id ? [{ userId: data.user.id, label: "Me" }] : []));
    load
      .then((list) => {
        if (!cancelled) setAssignees(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boards, activeBoard]);

  useEffect(() => {
    if (activeBoard) refreshBoard(activeBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard]);

  async function handleDragEnd(event: DragEndEvent) {
    setDragTicket(null);
    const ticketId = String(event.active.id);
    const overColumn = event.over ? String(event.over.id) : null;
    if (!overColumn) return;
    await moveTicket(ticketId, overColumn);
  }

  /** Drag and "Move to…" share one path; a failure refetches and says so. */
  async function moveTicket(ticketId: string, overColumn: string) {
    setBoardError(null);
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
    const ok = await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ticketId,
        columnId: overColumn,
        position: lastPos + 1024,
      }),
    })
      .then((res) => res.ok)
      .catch(() => false);
    if (!ok) setBoardError("Couldn't move that ticket. The board has been refreshed.");
    if (activeBoard) await refreshBoard(activeBoard);
  }

  if (signedOut) {
    return (
      <div className="w-full">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-2">
          Boards
        </h1>
        <p className="text-sm font-mono text-text-dim">
          Sign in to use kanban boards.
        </p>
      </div>
    );
  }
  if (boards === null) {
    return (
      <div className="w-full">
        <PageSkeleton label="Loading boards" variant="board" />
      </div>
    );
  }

  const board = boards.find((b) => b.id === activeBoard) ?? null;

  return (
    <div id="tour-board" className="w-full">
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
              body: JSON.stringify({
                name: newBoard,
                scope: activeOrg ? newBoardScope : "personal",
              }),
            });
            if (res.ok) {
              setNewBoard("");
              refreshBoards();
            }
          }}
          className="flex flex-wrap gap-2 min-w-0"
        >
          <label htmlFor="new-board" className="sr-only">
            New board name
          </label>
          {activeOrg && (
            <ScopeSelect
              id="new-board-scope"
              value={newBoardScope}
              onChange={setNewBoardScope}
              orgName={activeOrg.name}
            />
          )}
          <input
            id="new-board"
            value={newBoard}
            onChange={(e) => setNewBoard(e.target.value)}
            placeholder="New board"
            className="flex-1 min-w-0 bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
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

      {board && loadedBoardId !== board.id ? (
        <PageSkeleton label="Loading board" variant="board" />
      ) : board ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setDragTicket(tickets.find((t) => t.id === e.active.id) ?? null)
          }
          onDragEnd={handleDragEnd}
        >
          {/* Phase 63.5 — stack on phones; side-by-side columns forced
              horizontal scrolling for every card on a narrow screen. */}
          <div className="flex flex-col lg:flex-row gap-3 lg:overflow-x-auto pb-4">
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                column={col}
                columns={columns}
                onOpen={setOpenTicket}
                onMove={(id, to) => void moveTicket(id, to)}
                tickets={tickets
                  .filter((t) => t.columnId === col.id)
                  .sort((a, b) => a.position - b.position)}
                onAdd={async (title) => {
                  setBoardError(null);
                  const ok = await fetch("/api/tickets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      boardId: board.id,
                      columnId: col.id,
                      title,
                    }),
                  })
                    .then((res) => res.ok)
                    .catch(() => false);
                  if (!ok) {
                    setBoardError("Couldn't add that ticket. Your text is still in the box.");
                    return false;
                  }
                  await refreshBoard(board.id);
                  return true;
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {dragTicket ? <TicketCard ticket={dragTicket} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : null}
      {boardError && (
        <p role="alert" className="text-xs font-mono text-danger mt-2">
          {boardError}
        </p>
      )}
      {board && openTicket && (
        <TicketDialog
          ticket={openTicket}
          assignees={assignees}
          onClose={() => setOpenTicket(null)}
          onSaved={() => {
            setOpenTicket(null);
            void refreshBoard(board.id);
          }}
        />
      )}
      {board ? null : (
        <p className="text-sm font-mono text-text-dim">
          No boards yet — create one above. Org boards appear when your active
          organization has them.
        </p>
      )}
    </div>
  );
}
