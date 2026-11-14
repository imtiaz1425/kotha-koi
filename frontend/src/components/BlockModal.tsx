import React from 'react'

export interface BlockModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  isSubmitting?: boolean
  error?: string | null
}

export const BlockModal: React.FC<BlockModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  error = null,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FFFDF9] border-2 border-on-surface rounded-2xl shadow-[4px_4px_0px_#1c1b1b] max-w-sm w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b-2 border-on-surface/20 bg-[#FFF5E6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-xl font-bold">person_off</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Block Student</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs text-on-surface leading-relaxed font-medium">
            Are you sure you want to block this peer?
          </p>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Your current chat will end immediately. You and this student will <span className="font-bold text-on-surface">permanently never be matched again</span> in random chat.
          </p>

          {error && (
            <div className="px-3 py-2 bg-error/10 border border-error text-error text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-on-surface/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-[#1C1B1B] text-white font-bold text-xs rounded-xl border border-on-surface shadow-[2px_2px_0px_#888] hover:bg-black active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Blocking...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[14px]">person_off</span>
                  Block & Disconnect
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

