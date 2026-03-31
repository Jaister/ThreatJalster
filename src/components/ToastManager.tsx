import { useWorkspaceStore } from "../store";

export const ToastManager = () => {
  const toasts = useWorkspaceStore((state) => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item">
          {toast.text}
        </div>
      ))}
    </div>
  );
};
