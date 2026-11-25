import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileAltIcon, TimesIcon } from './shared.jsx';
import { useDocuments } from './useDocuments.js';
import DocMeta from './DocMeta.jsx';

/**
 * DocumentsModal — documentos oficiales que consulta RITIA, con código, versión
 * y fecha de cada uno. Se abre desde el botón "Documentos" del chat; se monta
 * solo mientras está abierto, así cada apertura consulta la lista vigente.
 * Mismo patrón visual que AboutRitaModal.
 */
const DocumentsModal = ({ onClose }) => {
    const { documents, loading, errored } = useDocuments();

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                role="dialog" aria-modal="true" aria-label="Documentos oficiales"
                className="bg-kiosk-card border border-kiosk-border rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-brand"><FileAltIcon size={24} /></div>
                        <div>
                            <h2 className="text-xl text-kiosk-text font-bold tracking-tight">Documentos oficiales</h2>
                            <p className="text-xs text-kiosk-muted mt-1">Lo que RITIA consulta para responderte, con su código y versión.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose} aria-label="Cerrar"
                        className="w-10 h-10 flex items-center justify-center bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border rounded-full text-kiosk-muted hover:text-kiosk-text transition-all"
                    >
                        <TimesIcon size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar pr-1">
                    {loading && <p className="text-kiosk-muted text-sm text-center py-8">Cargando documentos…</p>}
                    {errored && <p className="text-sm text-center py-8 text-rose-600">No se pudo cargar la lista de documentos. Intenta más tarde.</p>}
                    {!loading && !errored && (
                        <ul className="space-y-2">
                            {documents.map(doc => (
                                <li key={doc.name} className="bg-kiosk-panel border border-kiosk-border rounded-xl px-4 py-3">
                                    <p className="font-semibold text-kiosk-text text-sm flex items-start gap-2">
                                        <span className="text-blue-500 shrink-0 mt-0.5"><FileAltIcon size={15} /></span>
                                        <span>{doc.name}</span>
                                    </p>
                                    <DocMeta doc={doc} className="pl-6 mt-1" />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="mt-5 pt-5 border-t border-kiosk-border text-center flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-brand hover:bg-brand-hover transition-colors rounded-full text-white font-bold text-sm"
                    >
                        Cerrar
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default DocumentsModal;
