import { useEffect, useState } from 'react';
import '../styles/UpdateToast.css';

// Requirements: 9.1, 9.2, 9.5

export default function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!navigator.serviceWorker) return;

    function handleControllerChange() {
      setVisible(true);
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="update-toast" role="status" aria-live="polite">
      App updated
    </div>
  );
}
