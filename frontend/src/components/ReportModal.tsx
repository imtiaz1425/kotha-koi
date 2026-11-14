import React, { useState } from 'react'

export interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string, details?: string) => Promise<void>
  isSubmitting?: boolean
  error?: string | null
}

const REPORT_CATEGORIES = [
  { value: 'HARASSMENT', label: 'Harassment or Bullying', desc: 'Hostile, abusive, or threatening remarks.' },
  { value: 'SEXUAL_CONTENT', label: 'Nudity or Sexual Content', desc: 'Inappropriate video, nudity, or sexual solicitation.' },
  { value: 'HATE_SPEECH', label: 'Hate Speech', desc: 'Discrimination, derogatory slurs, or targeted hate.' },
  { value: 'SPAM_OR_BOT', label: 'Spam or Bot', desc: 'Repetitive advertising, links, or automated behavior.' },
  { value: 'IMPERSONATION', label: 'Underage or Impersonation', desc: 'Non-student, impersonator, or suspected minor.' },
  { value: 'THREATS_OR_SELF_HARM', label: 'Threats or Danger', desc: 'Threats of violence or self-harm.' },
  { value: 'OTHER', label: 'Other Guidelines Violation', desc: 'Other behavior violating community standards.' },
]

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = null,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('HARASSMENT')
  const [details, setDetails] = useState<string>('')

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit(selectedCategory, details)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FFFDF9] border-2 border-on-surface rounded-2xl shadow-[4px_4px_0px_#1c1b1b] max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b-2 border-on-surface/20 bg-[#FFF5E6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-xl font-bold">flag</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Report Chat Partner</h3>
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
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Reports are reviewed by university administrators. Submitting this report will end your current chat immediately.
          </p>

          {error && (
            <div className="px-3 py-2 bg-error/10 border border-error text-error text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Categories */}
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            <label className="text-xs font-bold text-on-surface">Reason for report</label>
            {REPORT_CATEGORIES.map((cat) => (
              <label
                key={cat.value}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedCategory === cat.value
                    ? 'border-primary bg-primary/10 shadow-[1px_1px_0px_#1c1b1b]'
                    : 'border-on-surface/15 hover:border-on-surface/40 bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="reportCategory"
                  value={cat.value}
                  checked={selectedCategory === cat.value}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-on-surface">{cat.label}</span>
                  <span className="text-[11px] text-on-surface-variant">{cat.desc}</span>
                </div>
              </label>
            ))}
          </div>

          {/* Optional Details */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor="report-details" className="text-xs font-bold text-on-surface">
                Additional Details (Optional)
              </label>
              <span className="text-[10px] text-on-surface-variant">{details.length}/500</span>
            </div>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              placeholder="Provide any additional context for moderators..."
              rows={2}
              className="w-full text-xs p-2.5 bg-surface border-2 border-on-surface/20 rounded-xl focus:border-on-surface focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-on-surface/15">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-error text-white font-bold text-xs rounded-xl border border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-error/90 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[14px]">flag</span>
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

