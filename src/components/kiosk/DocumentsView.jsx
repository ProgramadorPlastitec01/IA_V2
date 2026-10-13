import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../utils/apiConfig';
import { ViewTopBar, HandsHelpingIcon, SearchIcon, FileAltIcon, CheckIcon } from './shared.jsx';

/**
 * DocumentsView — "Documentos Disponibles" (rediseño 2026-10-09).
 * Lista en vivo desde /api/documents (mismo endpoint que ya usaba el modal
 * DocumentsGuide): deriva los nombres amigables de lo realmente indexado en
 * Qdrant, para no desactualizarse si cambia la base documental.
 */
const DocumentsView = ({ onHome, onNavigate }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [query, setQuery] = useState('');
    // Ref (no state) para "ya se hizo el fetch": con StrictMode, React
    // monta → desmonta → vuelve a montar el efecto en desarrollo. Si el
    // fetch arranca de forma síncrona en el primer montaje, su cleanup
    // marca `cancelled=true` ANTES de que la respuesta llegue, y el segundo
    // montaje nunca reintenta (hasFetchedRef ya quedó en true) — la vista
    // se queda en "Cargando..." para siempre. Diferir el arranque a un
    // microtask dentro de la propia promesa dencadena ambos montajes
    // (mount→cleanup→mount) antes de que el primero decida iniciar el
    // fetch, así que solo el montaje que sobrevive llega a ejecutarlo.
    // Mismo patrón que DocumentsGuide.jsx (modal previo a este rediseño).
    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (hasFetchedRef.current) return;
        let cancelled = false;
        Promise.resolve().then(() => {
            if (cancelled) return;
            hasFetchedRef.current = true;
            fetch(`${API_BASE_URL}/api/documents`)
                .then(r => r.json())
                .then(data => { if (!cancelled) setDocuments(data.documents || []); })
                .catch(() => { if (!cancelled) setErrored(true); })
                .finally(() => { if (!cancelled) setLoading(false); });
        });
        return () => { cancelled = true; };
    }, []);

    const filtered = documents.filter(name => name.toLowerCase().includes(query.toLowerCase()));

    return (
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-kiosk-bg">
            <ViewTopBar
                title="Documentos Oficiales Disponibles"
                onHome={onHome}
                action={
                    <button onClick={() => onNavigate('chat')} className="bg-blue-50 hover:bg-blue-100 text-kiosk-accent px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
                        <HandsHelpingIcon size={14} /><span>Preguntar a RITA</span>
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-kiosk-text">Base de Conocimiento Verificada</h2>
                        <p className="text-xs text-kiosk-muted mt-0.5">Estos son los documentos oficiales que el Asistente IA consulta para darte respuestas.</p>
                    </div>
                    <div className="bg-kiosk-card border border-kiosk-border rounded-xl px-3 py-2 flex items-center space-x-2 w-full md:w-80 shadow-sm">
                        <span className="text-kiosk-muted"><SearchIcon size={14} /></span>
                        <input
                            type="text" value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="Buscar documento..."
                            className="bg-transparent border-none text-kiosk-text text-xs md:text-sm focus:outline-none w-full"
                        />
                    </div>
                </div>

                {loading && <p className="text-kiosk-muted text-sm text-center py-10">Cargando documentos…</p>}
                {errored && <p className="text-sm text-center py-10 text-rose-600">No se pudo cargar la lista de documentos. Intenta más tarde.</p>}
                {!loading && !errored && filtered.length === 0 && (
                    <p className="text-kiosk-muted text-sm text-center py-10">Ningún documento coincide con tu búsqueda.</p>
                )}

                {!loading && !errored && filtered.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filtered.map((name, i) => (
                            <div key={i} className="bg-kiosk-card border border-kiosk-border hover:border-kiosk-accent/60 rounded-2xl p-5 flex flex-col justify-between transition-all shadow-sm">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-100">Documento Oficial</span>
                                    </div>
                                    <h4 className="font-bold text-kiosk-text text-base flex items-start gap-2">
                                        <span className="text-blue-500 shrink-0 mt-0.5"><FileAltIcon size={18} /></span>
                                        <span>{name}</span>
                                    </h4>
                                </div>
                                <div className="mt-4 pt-3 border-t border-kiosk-border flex items-center justify-between text-xs">
                                    <span className="text-kiosk-muted">Consultado por el Asistente IA</span>
                                    <span className="text-kiosk-accent font-semibold flex items-center space-x-1">
                                        <CheckIcon size={11} /><span>Indexado por IA</span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default DocumentsView;
