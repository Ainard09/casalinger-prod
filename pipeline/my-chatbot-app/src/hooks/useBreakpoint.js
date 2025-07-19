import { useState, useEffect } from 'react';

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState(getBreakpoint(window.innerWidth));

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

function getBreakpoint(width) {
  if (width < 768) return { name: 'mobile', chunk: 3 };
  if (width < 1024) return { name: 'tablet', chunk: 4 };
  if (width < 1280) return { name: 'desktop', chunk: 6 };
  return { name: 'large-desktop', chunk: 8 };
} 