/**
 * 精修模式撤销/重做管理器
 *
 * 基于历史记录（History Entry）模式：
 * - 每个操作是一个闭包对 { execute, rollback }，撤销时调用 rollback()，重做时调用 execute()。
 * - 连续操作通过 recordDebounced() 在 300ms 窗口内自动合并为一条记录。
 * - 最多保留 80 条记录，超出自动丢弃最旧记录。
 * - 与参考项目的关键差异：不使用同类型合并策略，仅使用时间窗口合并。
 */
interface HistoryEntry {
  label: string
  execute: () => void
  rollback: () => void
}

class RefineUndoManager {
  private undoHistory: HistoryEntry[] = []
  private redoHistory: HistoryEntry[] = []
  private readonly maxEntries = 80

  /** 合并定时器：连续 recordDebounced 调用在 300ms 内只保留最后一条 */
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private batchDelay = 300
  private pendingEntry: HistoryEntry | null = null

  private listener: (() => void) | null = null

  onChange(cb: () => void) {
    this.listener = cb
  }

  /**
   * 立即记录一条操作。
   * 先刷新待合并的条目，再推入历史栈。
   */
  record(entry: HistoryEntry) {
    this._flushPending()
    this.undoHistory.push(entry)
    this.redoHistory = []
    this._trimHistory()
    this._notify()
  }

  /**
   * 延迟记录（用于连续输入，如打字、拖拽滑块）。
   * 每次调用重置计时器，300ms 内无新调用则自动提交。
   */
  recordDebounced(entry: HistoryEntry) {
    this.pendingEntry = entry
    if (this.batchTimer) clearTimeout(this.batchTimer)
    this.batchTimer = setTimeout(() => this._flushPending(), this.batchDelay)
  }

  private _flushPending() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    if (!this.pendingEntry) return
    this.undoHistory.push(this.pendingEntry)
    this.redoHistory = []
    this.pendingEntry = null
    this._trimHistory()
    this._notify()
  }

  private _trimHistory() {
    while (this.undoHistory.length > this.maxEntries) {
      this.undoHistory.shift()
    }
  }

  /** 撤销最近一条操作 */
  undo() {
    this._flushPending()
    if (this.undoHistory.length === 0) return
    const entry = this.undoHistory.pop()!
    try {
      entry.rollback()
      this.redoHistory.push(entry)
    } catch (e) {
      console.error('[RefineUndo] undo failed:', e)
      this.undoHistory.push(entry)
    }
    this._notify()
  }

  /** 重做最近撤销的操作 */
  redo() {
    if (this.redoHistory.length === 0) return
    const entry = this.redoHistory.pop()!
    try {
      entry.execute()
      this.undoHistory.push(entry)
    } catch (e) {
      console.error('[RefineUndo] redo failed:', e)
      this.redoHistory.push(entry)
    }
    this._notify()
  }

  canUndo(): boolean {
    return this.undoHistory.length > 0 || this.pendingEntry !== null
  }

  canRedo(): boolean {
    return this.redoHistory.length > 0
  }

  /** 清空全部历史 */
  reset() {
    this._flushPending()
    this.undoHistory = []
    this.redoHistory = []
    this.pendingEntry = null
    this._notify()
  }

  private _notify() {
    if (this.listener) this.listener()
  }
}

/** 模块级单例 */
export const refineUndo = new RefineUndoManager()