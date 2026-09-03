import React, { useEffect, useState } from 'react';

interface DepartureCounterProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

export const DepartureCounter: React.FC<DepartureCounterProps> = ({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  duration = 1600,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = 0;
    const endValue = value;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  const formattedNumber = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toString();

  return (
    <span className={`font-mono inline-flex items-baseline tracking-tight ${className}`}>
      {prefix && <span className="opacity-75 mr-0.5">{prefix}</span>}
      <span>{formattedNumber}</span>
      {suffix && <span className="text-[0.75em] ml-0.5 opacity-80">{suffix}</span>}
    </span>
  );
};
