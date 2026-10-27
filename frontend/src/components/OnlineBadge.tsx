import { useOnlineCount } from '../context/online-context'

export function OnlineBadge() {
  const count = useOnlineCount()

  return (
    <div
      id="onlineCounter"
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]"
      title={`${count} UIU student${count === 1 ? '' : 's'} online`}
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-on-surface shrink-0" />
      <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
        Online: {count}
      </span>
    </div>
  )
}
