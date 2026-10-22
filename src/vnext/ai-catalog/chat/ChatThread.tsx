import React from 'react';
import { ChatIcon } from './ChatIcons';

interface Props {
  /** Name of the conversation for screen readers (the element is a polite live log). */
  readonly label: string;
  /** Changes whenever a message is added at the end or the last one changes. */
  readonly tailKey: string;
  /** Changes when the person sends something: always show the newest message then. */
  readonly followKey: number;
  /** Nothing in the conversation yet: leave the suggestions where they are. */
  readonly empty: boolean;
  /** A new proposal opens from its beginning (title and "Página 1"), not scrolled down to its buttons (D-07). */
  readonly revealKey?: string;
  readonly revealRef?: React.RefObject<HTMLElement>;
  readonly children: React.ReactNode;
}

/** How close to the end still counts as "reading the newest message". */
const NEAR_END_PX = 48;

/**
 * The ONE scroll area of the assistant: the conversation fills the panel and follows the newest message, unless the
 * person scrolled up to read; then "Ir para a última mensagem" brings them back.
 */
export function ChatThread({ label, tailKey, followKey, empty, revealKey, revealRef, children }: Props) {
  const log = React.useRef<HTMLDivElement>(null);
  const nearEnd = React.useRef(true);
  const [away, setAway] = React.useState(false);
  const lastFollow = React.useRef(followKey);

  const toEnd = React.useCallback((smooth = false) => {
    const element = log.current;
    if (!element) return;
    element.scrollTo?.(smooth ? { top: element.scrollHeight, behavior: 'smooth' } : { top: element.scrollHeight });
    nearEnd.current = true;
    setAway(false);
  }, []);

  React.useLayoutEffect(() => {
    const followed = lastFollow.current !== followKey;
    lastFollow.current = followKey;
    if (empty) return;
    if (followed || nearEnd.current) toEnd();
    else setAway(true);
  }, [tailKey, followKey, empty, toEnd]);

  // Declared after the effect above, so in the same update it runs last and wins.
  React.useEffect(() => {
    const scroller = log.current, target = revealRef?.current;
    if (!revealKey || !scroller || !target) return;
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo?.({ top: Math.max(0, scroller.scrollTop + offset - 8) });
  }, [revealKey, revealRef]);

  return (
    <div className="ai-chat-thread-wrap">
      <div ref={log} className="ai-chat-thread" role="log" aria-label={label} aria-live="polite" tabIndex={-1}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_END_PX;
          setAway(!nearEnd.current);
        }}>
        {children}
      </div>
      {away && !empty && (
        <button type="button" className="ai-chat-jump" onClick={() => toEnd(true)}>
          <ChatIcon name="down" size={18} />Ir para a última mensagem
        </button>
      )}
    </div>
  );
}
