import { AsyncLocalStorage } from "node:async_hooks";
import { NetException, netErrors } from "../../utils/essDotnet.js";
import { persistRoutingChanges, RoutingChange, RoutingTask, TaskHistory } from "./routingManagement.js";

// The request-scoped SEPRoutingManagementDbContext of ESS_Backend. RoutingManagementService,
// RoutingLogService and CustomWorkflowConfigService share one instance per request, so this
// keeps EF Core's unit-of-work behavior:
// - entities read with tracking are held here; edits stay in memory until SaveChanges, so later
//   database reads still see the old values;
// - a row that is already tracked comes back as the tracked instance (identity resolution);
// - SaveChanges writes added/changed/removed entities in one transaction, changed columns only;
// - after Dispose, every database access through the context throws ObjectDisposedException.

type TaskEntry = { entity: RoutingTask; original: RoutingTask | null; state: "Added" | "Unchanged" | "Deleted" };

const CONTEXT_NAME = "SEPRoutingManagementDbContext";

function valuesEqual(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

export class RoutingDbContext {
  private disposed = false;
  private readonly tasks = new Map<string, TaskEntry>();
  private addedHistories: TaskHistory[] = [];

  private ensureNotDisposed() {
    if (this.disposed) {
      throw netErrors.objectDisposed(CONTEXT_NAME);
    }
  }

  // Every query or command through the context (DbSet, Database.SqlQuery, GetDbConnection).
  async use<T>(work: () => Promise<T>): Promise<T> {
    this.ensureNotDisposed();
    return work();
  }

  // A tracked query on Tasks: rows already tracked return the tracked instance unchanged.
  async trackTasks(work: () => Promise<RoutingTask[]>): Promise<RoutingTask[]> {
    const rows = await this.use(work);
    return rows.map((row) => {
      const existing = this.tasks.get(row.ID);
      if (existing) {
        return existing.entity;
      }
      this.tasks.set(row.ID, { entity: row, original: { ...row }, state: "Unchanged" });
      return row;
    });
  }

  async trackTask(work: () => Promise<RoutingTask | null>): Promise<RoutingTask | null> {
    const [task] = await this.trackTasks(async () => {
      const row = await work();
      return row ? [row] : [];
    });
    return task ?? null;
  }

  // _db.Tasks.Add(task)
  addTask(task: RoutingTask) {
    this.ensureNotDisposed();
    this.tasks.set(task.ID, { entity: task, original: null, state: "Added" });
  }

  // _db.Tasks.Remove(task)
  removeTask(task: RoutingTask) {
    this.ensureNotDisposed();
    const entry = this.tasks.get(task.ID);
    if (!entry) {
      this.tasks.set(task.ID, { entity: task, original: { ...task }, state: "Deleted" });
    } else if (entry.state === "Added") {
      this.tasks.delete(task.ID);
    } else {
      entry.state = "Deleted";
    }
  }

  // _db.TaskHistories.Add(history)
  addTaskHistory(history: TaskHistory) {
    this.ensureNotDisposed();
    this.addedHistories.push(history);
  }

  private pendingChanges(): RoutingChange[] {
    const changes: RoutingChange[] = [];
    for (const entry of this.tasks.values()) {
      if (entry.state === "Added") {
        changes.push({ kind: "insertTask", task: entry.entity });
      } else if (entry.state === "Deleted") {
        changes.push({ kind: "deleteTask", id: entry.entity.ID });
      } else if (entry.original) {
        const original = entry.original;
        const values = Object.fromEntries(
          Object.entries(entry.entity).filter(([name, value]) => !valuesEqual(value, original[name as keyof RoutingTask])),
        ) as Partial<RoutingTask>;
        if (Object.keys(values).length > 0) {
          changes.push({ kind: "updateTask", id: entry.entity.ID, values });
        }
      }
    }
    for (const history of this.addedHistories) {
      changes.push({ kind: "insertTaskHistory", history });
    }
    return changes;
  }

  // _db.SaveChangesAsync()
  async saveChanges(): Promise<number> {
    this.ensureNotDisposed();
    const changes = this.pendingChanges();
    if (changes.length === 0) {
      return 0;
    }

    try {
      await persistRoutingChanges(changes);
    } catch (error) {
      // EF wraps database errors in DbUpdateException; its own concurrency check is thrown as is.
      const name = (error as { name?: unknown } | null)?.name;
      const isDatabaseError =
        (error instanceof NetException && name === "Microsoft.Data.SqlClient.SqlException") ||
        (typeof name === "string" && name.startsWith("PrismaClient"));
      if (isDatabaseError) {
        throw netErrors.dbUpdate();
      }
      throw error;
    }

    // AcceptAllChanges
    for (const [id, entry] of [...this.tasks]) {
      if (entry.state === "Deleted") {
        this.tasks.delete(id);
      } else {
        entry.state = "Unchanged";
        entry.original = { ...entry.entity };
      }
    }
    this.addedHistories = [];
    return changes.length;
  }

  // `using var db = _db;` disposes the injected context at the end of the scope.
  dispose() {
    this.disposed = true;
  }
}

const scope = new AsyncLocalStorage<RoutingDbContext>();

// One context per HTTP request, like AddDbContext's scoped lifetime.
export function runWithRoutingDb<T>(work: () => T): T {
  return scope.run(new RoutingDbContext(), work);
}

export function routingDb(): RoutingDbContext {
  const context = scope.getStore();
  if (!context) {
    throw new Error(`No ${CONTEXT_NAME} for this request: mount routingDbScope on the router.`);
  }
  return context;
}
