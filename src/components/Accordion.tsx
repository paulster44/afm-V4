import React, { ReactNode, useRef, useEffect } from 'react';

type AccordionProps = {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  isNextStep?: boolean;
};

const Accordion: React.FC<AccordionProps> = ({ title, children, isOpen, onToggle, isNextStep }) => {
  const headerRef = useRef<HTMLHeadingElement>(null); // Ref for the h2 element
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueId = title.replace(/\s+/g, '-').toLowerCase();

  useEffect(() => {
    // This effect manages the open/close animation and dynamic height
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const handleTransitionEnd = () => {
      if (isOpen) {
        container.style.overflow = 'visible';
      }
    };

    container.style.overflow = 'hidden';
    container.addEventListener('transitionend', handleTransitionEnd);

    const resizeObserver = new ResizeObserver(() => {
      if (isOpen) {
        container.style.maxHeight = `${content.scrollHeight}px`;
      }
    });
    
    resizeObserver.observe(content);

    if (isOpen) {
      container.style.maxHeight = `${content.scrollHeight}px`;
    } else {
      container.style.maxHeight = '0px';
    }

    return () => {
      container.removeEventListener('transitionend', handleTransitionEnd);
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    // This effect handles scrolling the accordion header into view when opened
    if (isOpen) {
      const headerElement = headerRef.current;
      if (!headerElement) return;

      const timer = setTimeout(() => {
        const headerRect = headerElement.getBoundingClientRect();
        const isHeaderInView = headerRect.top >= 0 && headerRect.bottom <= window.innerHeight;

        if (!isHeaderInView) {
            const scrollY = window.scrollY + headerRect.top - 20; // 20px margin from top
            window.scrollTo({
                top: scrollY,
                behavior: 'smooth'
            });
        }
      }, 50); // Small delay to let the UI update before calculating position

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return (
    <div className="border-t border-gray-700 first:border-t-0">
      <h2 ref={headerRef} id={`accordion-header-${uniqueId}`}>
        <button
          type="button"
          className={`flex items-center justify-between w-full p-6 font-medium text-left text-gray-200 hover:bg-gray-700 focus:outline-none transition-colors ${isNextStep ? 'next-step-highlight' : ''}`}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`accordion-body-${uniqueId}`}
        >
          <span>{title}</span>
          <svg
            className={`w-4 h-4 shrink-0 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
      >
        <div ref={contentRef} className="px-6 pb-6 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Accordion;