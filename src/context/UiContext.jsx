import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Field, Modal } from '../components/ui';

const UiContext = createContext(null);

/**
 * يوفر: toast(msg, kind) · confirm({title, text, okLabel, danger}) → Promise<boolean>
 *        prompt({title, label, okLabel, required, danger}) → Promise<string|null>
 */
export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const idRef = useRef(0);

  const toast = useCallback((message, kind = 'ok') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setDialog({ type: 'confirm', ...opts, resolve })),
    [],
  );

  const prompt = useCallback((opts) => {
    setText(opts.initial || '');
    setTouched(false);
    return new Promise((resolve) => setDialog({ type: 'prompt', ...opts, resolve }));
  }, []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const promptInvalid = dialog?.type === 'prompt' && dialog.required !== false && !text.trim();

  return (
    <UiContext.Provider value={{ toast, confirm, prompt }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'ok' ? '' : t.kind}`}>{t.message}</div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => close(dialog.type === 'confirm' ? false : null)}
          footer={
            <>
              <button
                className={`btn ${dialog.danger ? 'danger' : 'teal'}`}
                onClick={() => {
                  if (dialog.type === 'prompt') {
                    setTouched(true);
                    if (promptInvalid) return;
                    close(text.trim());
                  } else close(true);
                }}
              >
                {dialog.okLabel || 'تأكيد'}
              </button>
              <button className="btn ghost" onClick={() => close(dialog.type === 'confirm' ? false : null)}>إلغاء</button>
            </>
          }
        >
          {dialog.text && <p className="muted" style={{ marginTop: 0 }}>{dialog.text}</p>}
          {dialog.type === 'prompt' && (
            <Field label={dialog.label} required={dialog.required !== false} error={touched && promptInvalid ? 'هذا الحقل مطلوب.' : null}>
              <textarea className="inp" autoFocus value={text} placeholder={dialog.placeholder}
                onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
        </Modal>
      )}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);
