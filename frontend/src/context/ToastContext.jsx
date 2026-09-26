import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from '../components/Icon';

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const t = useRef(null);
  const show = useCallback((msg, type = 'ok') => {
    clearTimeout(t.current);
    setToast({ msg, type });
    t.current = setTimeout(() => setToast(null), type === 'err' ? 5000 : 3600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          <Icon name={toast.type === 'err' ? 'error' : 'check_circle'} />
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
