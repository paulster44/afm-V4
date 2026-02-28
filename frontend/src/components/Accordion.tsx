
import React, { ReactNode, useRef, useEffect } from 'react';

type AccordionProps = {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
};

const Accordion: React.FC<AccordionProps> = ({ title, children, isOpen, onToggle }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = title.replace(/\s+/g, '-').toLowerCase();

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // This function is called when the CSS transition finishes
    const handleTransitionEnd = () => {
      // If the accordion has just finished opening, set overflow to visible
      // so that any absolutely positioned children (like tooltips) can show.
      if (isOpen) {
        container.style.overflow = 'visible';
      }
    };

    // When toggling, we must ensure overflow is hidden before the animation starts.
    container.style.overflow = 'hidden';

    // Set up the event listener for transition end
    container.addEventListener('transitionend', handleTransitionEnd);

    // This observer will fire whenever the content's size changes (e.g., adding a new musician).
    const resizeObserver = new ResizeObserver(() => {
      // If the accordion is open, we update its maxHeight to match the new content height.
      if (isOpen) {
        container.style.maxHeight = `${content.scrollHeight}px`;
      }
    });

    // Start observing the content element.
    resizeObserver.observe(content);

    // Set the initial maxHeight when the `isOpen` state changes.
    // This is crucial for the open/close animation.
    if (isOpen) {
      container.style.maxHeight = `${content.scrollHeight}px`;
    } else {
      container.style.maxHeight = '0px';
    }

    // Cleanup: remove the event listener and disconnect the observer when the component unmounts or `isOpen` changes.
    return () => {
      container.removeEventListener('transitionend', handleTransitionEnd);
      resizeObserver.disconnect();
    };
  }, [isOpen]); // The effect re-runs when `isOpen` changes, setting up the observer and initial state.
  // The observer itself handles dynamic content changes while the accordion is open.

  return (
    <div className="border-t border-slate-700 first:border-t-0 bg-slate-800">
      <h2 id={`accordion-header-${uniqueId}`}>
        <button
          type="button"
          className="flex items-center justify-between w-full p-6 font-semibold font-serif text-lg text-left text-slate-200 hover:bg-slate-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 transition-colors duration-200"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`accordion-body-${uniqueId}`}
        >
          <span className="tracking-wide">{title}</span>
          <svg
            className={`w-5 h-5 shrink-0 transform transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : 'text-slate-400'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </h2>
      <div
        ref={containerRef}
        id={`accordion-body-${uniqueId}`}
        role="region"
        aria-labelledby={`accordion-header-${uniqueId}`}
        className="transition-[max-height] duration-300 ease-in-out"
      // The style is now managed entirely by the useEffect hook to handle dynamic content.
      >
        <div ref={contentRef} className="px-6 pb-6 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Accordion;
