/**
 * Fixed-height virtual list. Do NOT use for chat bubbles with variable markdown/
 * mermaid height — rows force `height: itemHeight` and stack via translateY, which
 * causes overlapping messages. ChatApp uses a plain `.message-list` scroll instead.
 * 가변 높이 채팅 버블에는 사용하지 말 것(겹침). 벤치/고정행 전용.
 */
import React, { useRef, useEffect, useState, useMemo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 5
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      setContainerHeight(container.clientHeight);
      const handleScroll = () => setScrollTop(container.scrollTop);
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length, start + visibleCount + overscan * 2);
    return { start, end };
  }, [scrollTop, containerHeight, itemHeight, items.length, overscan]);

  const offsetY = visibleRange.start * itemHeight;

  return (
    <div
      ref={containerRef}
      className="virtual-list"
      style={{ height: '100%', overflow: 'auto' }}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {items.slice(visibleRange.start, visibleRange.end).map((item, index) => (
            <div key={visibleRange.start + index} style={{ height: itemHeight }}>
              {renderItem(item, visibleRange.start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}