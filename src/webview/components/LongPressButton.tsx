import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@fluentui/react-components';
import { LongPressButtonProps } from '../types.js';

export const LongPressButton: React.FC<LongPressButtonProps> = ({
  onClick,
  onLongPress,
  disabled,
  children,
  appearance = 'primary',
  style,
  title,
  holdDuration = 2000,
  bufferDuration = 500
}) => {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const bufferTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRequestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  const clearTimers = () => {
    if (bufferTimerRef.current) {
      clearTimeout(bufferTimerRef.current);
      bufferTimerRef.current = null;
    }
    if (progressRequestRef.current) {
      cancelAnimationFrame(progressRequestRef.current);
      progressRequestRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  };

  const handleMouseDown = () => {
    if (disabled) return;

    // Start buffer timer
    bufferTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      startTimeRef.current = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const totalProgressDuration = Math.max(1, holdDuration - bufferDuration);
        const p = Math.min((elapsed / totalProgressDuration) * 100, 100);

        setProgress(p);

        if (p < 100) {
          progressRequestRef.current = requestAnimationFrame(animate);
        } else {
          // Trigger Action
          clearTimers();
          onLongPress();
        }
      };

      progressRequestRef.current = requestAnimationFrame(animate);
    }, bufferDuration);
  };

  const handleMouseUp = () => {
    if (disabled) return;

    if (isHolding) {
      // If we were holding but released before completion, just cancel
      clearTimers();
    } else {
      // Normal click
      if (bufferTimerRef.current) {
        clearTimers();
        onClick();
      }
    }
  };

  const handleMouseLeave = () => {
    if (disabled) return;
    clearTimers();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.repeat) return;
      e.preventDefault();
      handleMouseDown();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleMouseUp();
    }
  };

  return (
    <Button
      appearance={appearance}
      disabled={disabled}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleMouseLeave}
      // Touch support
      onTouchStart={handleMouseDown}
      onTouchEnd={(e) => {
        e.preventDefault(); // Prevent ghost click
        handleMouseUp();
      }}
      style={{
        ...style,
        position: 'relative',
        overflow: 'hidden',
        // If holding, we force text color to be black/dark for contrast against yellow
        color: isHolding ? 'black' : style?.color,
        // Ensure z-index allows overlay
      }}
      title={title}
      aria-label={title || "Long press button"}
    >
      {/* Progress Overlay */}
      {isHolding && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${progress}%`,
            backgroundColor: '#ecff00',
            zIndex: 0,
            transition: 'width 100ms linear', // Smooth out frame updates slightly
          }}
        />
      )}

      {/* Content */}
      <span style={{ position: 'relative', zIndex: 1 }}>
        {isHolding ? "Hold to compress..." : children}
      </span>
    </Button>
  );
};
