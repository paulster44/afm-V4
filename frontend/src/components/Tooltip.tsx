import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    content: ReactNode;
    children: ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ left: 0, top: 0 });
    const triggerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const calculateCoords = () => {
        if (triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            // Center horizontally relative to trigger, and position above
            setCoords({
                left: triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2),
                top: triggerRect.top - tooltipRect.height - 8, // 8px visual gap
            });
        }
    };

    useEffect(() => {
        if (isVisible) {
            calculateCoords();
            // Recalculate if window resizes or scrolls while tooltip is open
            window.addEventListener('scroll', calculateCoords, true);
            window.addEventListener('resize', calculateCoords);
        }
        return () => {
            window.removeEventListener('scroll', calculateCoords, true);
            window.removeEventListener('resize', calculateCoords);
        };
    }, [isVisible]);

    return (
        <span
            ref={triggerRef}
            className="relative flex items-center group cursor-pointer"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onFocus={() => setIsVisible(true)}
            onBlur={() => setIsVisible(false)}
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={isVisible}
        >
            {children}
            {isVisible && createPortal(
                <div
                    ref={tooltipRef}
                    className="fixed z-50 w-max max-w-xs p-3 text-xs text-white bg-slate-700/95 font-sans normal-case tracking-normal rounded-md shadow-xl animate-in fade-in duration-200 pointer-events-none"
                    style={{
                        left: `${coords.left}px`,
                        top: `${coords.top}px`,
                    }}
                    role="tooltip"
                >
                    {content}
                    {/* Tooltip caret (arrow pointing down) */}
                    <svg
                        className="absolute text-slate-700/95 h-2 w-full left-0 top-full"
                        x="0px" y="0px" viewBox="0 0 255 255" xmlSpace="preserve"
                    >
                        <polygon className="fill-current" points="0,0 127.5,127.5 255,0" />
                    </svg>
                </div>,
                document.body
            )}
        </span>
    );
};

export default Tooltip;
