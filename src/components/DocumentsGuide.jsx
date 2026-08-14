import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../utils/apiConfig';

/**
 * DocumentsGuide — modal informativo con los documentos base del asistente.
 * Mismo patrón visual que HelpGuide.jsx. La lista se consulta en vivo a
 * /api/documents (deriva los nombres amigables desde lo realmente indexado
 * en Qdrant), para no desactualizarse si cambia la base documental.
 */
const DocumentsGuide = ({ isOpen, onClose }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errored, setErrored] = useState(false);
    // Ref (no state) para "ya se hizo el fetch": si `loading`/`documents` estuvieran
    // en el array de dependencias del efecto, el propio setLoading(true) dispara
    // una re-ejecución que corre el cleanup y marca `cancelled=true` sobre el
    // fetch que ese mismo efecto acababa de lanzar — por eso se quedaba en
    // "Cargando..." para siempre. Con el ref, el efecto solo depende de `isOpen`.
    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (!isOpen || hasFetchedRef.current) return;
        let cancelled = false;
        Promise.resolve().then(() => {
            if (cancelled) return;
            hasFetchedRef.current = true;
            setLoading(true);
            setErrored(false);
            fetch(`${API_BASE_URL}/api/documents`)
                .then(r => r.json())
                .then(data => { if (!cancelled) setDocuments(data.documents || []); })
                .catch(() => { if (!cancelled) setErrored(true); })
                .finally(() => { if (!cancelled) setLoading(false); });
        });
        return () => { cancelled = true; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                    className="bg-bg-panel border border-line rounded-2xl p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'var(--color-cat-teal-fill)' }}>
                                📄
                            </div>
                            <div>
                                <h2 className="text-xl text-ink font-medium tracking-tight">Documentos Base</h2>
                                <p className="text-xs text-muted uppercase tracking-widest mt-1">¿Sobre qué puedo preguntar?</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center bg-surface hover:bg-line border border-line rounded-full text-muted hover:text-ink transition-all text-xl"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="overflow-y-auto custom-scrollbar pr-1">
                        {loading && <p className="text-muted text-sm text-center py-6">Cargando...</p>}
                        {errored && <p className="text-sm text-center py-6" style={{ color: 'var(--color-cat-coral)' }}>No se pudo cargar la lista de documentos.</p>}
                        {!loading && !errored && (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {documents.map((name, i) => (
                                    <li key={i} className="flex items-center gap-3 p-4 bg-surface border border-line rounded-xl text-ink text-sm">
                                        <span className="text-lg flex-shrink-0">📘</span>
                                        <span>{name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-line text-center flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-brand hover:bg-brand-hover transition-all rounded-full text-white font-medium tracking-wide"
                        >
                            Cerrar
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default DocumentsGuide;
