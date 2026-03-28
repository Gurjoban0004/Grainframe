import { useState } from 'react';
import '../styles/CompareButton.css';

export default function CompareButton({ onPressStart, onPressEnd, visible }) {
  const [pressed, setPressed] = useState(false);

  if (!visible) return null;

  function handlePressStart() {
    setPressed(true);
    onPressStart();
  }

  function handlePressEnd() {
    setPressed(false);
    onPressEnd();
  }

  return (
    <button
      className={`compare-btn${pressed ? ' compare-btn--pressed' : ''}`}
      aria-label="Show original photo"
      onPointerDown={handlePressStart}
      onPointerUp={handlePressEnd}
      onPointerLeave={handlePressEnd}
      onTouchStart={(e) => {
        e.preventDefault();
        handlePressStart();
      }}
      onTouchEnd={handlePressEnd}
    >
      ORIGINAL
    </button>
  );
}
